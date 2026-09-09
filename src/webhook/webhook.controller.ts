import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
  Req,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { ServiceLogger } from "@lib/logger";
import { REVIEW_QUEUE_NAME } from "../constants/queue.constants";
import { TriggerService } from "./trigger.service";
import { WebhookGuard } from "./webhook.guard";
import {
  IBitbucketCommentWebhook,
  IBitbucketPrWebhook,
  IBitbucketWebhookBase,
  IWebhookPrPayload,
} from "./interfaces/webhook.interfaces";
import { ReviewRunStatus, TriggerType } from "../entities/review-run.entity";
import { ReviewService } from "../review/review.service";
import { IReviewJobData } from "../queue/interfaces/queue.interfaces";
import { BitbucketService } from "../bitbucket/bitbucket.service";
import { RuntimeSettingsService } from "../settings/runtime-settings.service";
import {
  type IBitbucketCredentialSnapshot,
  type IRepositoryIdentity,
  type IReviewSettingsSnapshot,
} from "../settings/runtime-settings.types";

@Controller("webhooks")
export class WebhookController {
  private readonly logger = new ServiceLogger(WebhookController.name);

  constructor(
    @InjectQueue(REVIEW_QUEUE_NAME) private readonly reviewQueue: Queue,
    private readonly triggerService: TriggerService,
    private readonly reviewService: ReviewService,
    private readonly runtimeSettings: RuntimeSettingsService,
    private readonly bitbucketService: BitbucketService,
  ) {}

  @Post("bitbucket")
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(WebhookGuard)
  async handleBitbucketWebhook(
    @Body() body: IBitbucketWebhookBase,
    @Headers("x-event-key") eventKey: string,
    @Req() request: {
      verifiedRepoSlug?: string;
      verifiedWorkspaceSlug?: string;
    },
  ): Promise<{ accepted: boolean; reason?: string }> {
    const identity = {
      workspaceSlug: request.verifiedWorkspaceSlug,
      repositorySlug: request.verifiedRepoSlug,
    };
    if (!identity.workspaceSlug || !identity.repositorySlug) {
      throw new BadRequestException("Verified repository identity missing");
    }

    if (eventKey === "pullrequest:comment_created") {
      return this.handleCommentEvent(
        body as IBitbucketCommentWebhook,
        identity as IRepositoryIdentity,
      );
    }

    if (eventKey === "pullrequest:created" || eventKey === "pullrequest:updated") {
      return this.handlePrEvent(
        body as IBitbucketPrWebhook,
        eventKey,
        identity as IRepositoryIdentity,
      );
    }

    return { accepted: false, reason: `Ignored event: ${eventKey}` };
  }

  /** 댓글 이벤트 처리 (@codex 멘션 트리거) */
  private async handleCommentEvent(
    body: IBitbucketCommentWebhook,
    identity: IRepositoryIdentity,
  ): Promise<{ accepted: boolean; reason?: string }> {
    if (!body.comment?.id || !body.comment?.content?.raw) {
      throw new BadRequestException(
        "Missing required fields: comment.id, comment.content.raw",
      );
    }
    const prPayload = this.extractPrPayload(body, identity);
    const baseSettings = await this.runtimeSettings.resolveReviewSettings(
      prPayload,
    );

    const forceReview = this.triggerService.isForceReview(
      body.comment.content.raw,
    );
    if (
      !forceReview &&
      (!this.triggerService.shouldMentionReview(baseSettings.triggerMode) ||
        !this.triggerService.hasCodexMention(body.comment.content.raw))
    ) {
      return { accepted: false, reason: "No @codex mention found" };
    }


    const model = this.triggerService.parseModelOverride(
      body.comment.content.raw,
    );
    const settings: IReviewSettingsSnapshot = Object.freeze({
      ...baseSettings,
      ...(model ? { model } : {}),
    });
    const credentials = (
      await this.runtimeSettings.resolveJobCredentials(prPayload)
    ).bitbucket;

    const result = await this.enqueueReview(
      prPayload,
      TriggerType.MENTION,
      body.comment.id,
      forceReview,
      settings,
    );

    if (result.accepted) {
      this.postInProgressReply(
        prPayload,
        body.comment.id,
        settings,
        credentials,
      );
    }

    return result;
  }

  /** PR 이벤트 처리 (자동 트리거) */
  private async handlePrEvent(
    body: IBitbucketPrWebhook,
    eventKey: string,
    identity: IRepositoryIdentity,
  ): Promise<{ accepted: boolean; reason?: string }> {
    const prPayload = this.extractPrPayload(body, identity);
    const settings = await this.runtimeSettings.resolveReviewSettings(prPayload);
    if (!this.triggerService.shouldAutoReview(eventKey, settings.triggerMode)) {
      return { accepted: false, reason: `Ignored event: ${eventKey}` };
    }
    const credentials = (
      await this.runtimeSettings.resolveJobCredentials(prPayload)
    ).bitbucket;

    const result = await this.enqueueReview(
      prPayload,
      TriggerType.AUTO,
      undefined,
      false,
      settings,
    );

    if (result.accepted) {
      this.postInProgressComment(prPayload, settings, credentials);
    }

    return result;
  }

  /** 공통: idempotency 체크 + stale job 제거 + DB 생성 + supersede + 큐 등록 */
  private async enqueueReview(
    prPayload: IWebhookPrPayload,
    triggerType: TriggerType,
    triggerCommentId: number | undefined,
    forceReview: boolean,
    settings: IReviewSettingsSnapshot,
  ): Promise<{ accepted: boolean; reason?: string }> {
    const legacyBaseKey = `${prPayload.repositorySlug}:${prPayload.pullRequestId}:${prPayload.headCommitHash}`;
    const baseKey = `${prPayload.workspaceSlug}:${legacyBaseKey}`;
    const idempotencyKey =
      forceReview && triggerCommentId
        ? `${baseKey}-force-${triggerCommentId}`
        : baseKey;
    const jobId = `review-${Buffer.from(idempotencyKey).toString("base64url")}`;
    const legacyKey =
      forceReview && triggerCommentId
        ? `${legacyBaseKey}-force-${triggerCommentId}`
        : legacyBaseKey;
    const legacyEncodedJobId = `review-${Buffer.from(legacyKey).toString("base64url")}`;

    const isDuplicate =
      await this.reviewService.existsByIdempotencyKey(idempotencyKey);
    if (isDuplicate) {
      this.logger.log(`Duplicate review request skipped: ${idempotencyKey}`);
      return { accepted: false, reason: "Duplicate request" };
    }

    // 새 ID와 전환 전 idempotencyKey ID를 모두 정리해 rolling deploy 중 재큐잉을
    // 안전하게 유지한다. 이전 job은 queue retention이 끝난 뒤 자연히 조회되지 않는다.
    for (const staleJobId of [
      jobId,
      idempotencyKey,
      legacyKey,
      legacyEncodedJobId,
    ]) {
      try {
        const existingJob = await this.reviewQueue.getJob(staleJobId);
        if (existingJob) {
          await existingJob.remove();
          this.logger.log(`Removed stale BullMQ job: ${staleJobId}`);
        }
      } catch (err) {
        this.logger.error(
          `Failed to remove stale job: ${(err as Error).message}`,
        );
      }
    }

    const reviewRun = await this.reviewService.createReviewRun({
      ...prPayload,
      idempotencyKey,
      triggerType,
      triggerCommentId,
      settingsSnapshot: settings,
    });

    // Supersede any active reviews for the same PR
    await this.reviewService.supersedeActivePrReviews(
      prPayload.workspaceSlug,
      prPayload.repositorySlug,
      prPayload.pullRequestId,
      reviewRun.id,
    );

    const jobData: IReviewJobData = {
      reviewRunId: reviewRun.id,
      ...prPayload,
      idempotencyKey,
      triggerType,
      triggerCommentId,
      settings,
    };

    // 등록이 실패하면 run을 FAILED로 남긴다. 게시 증거 없는 FAILED는
    // existsByIdempotencyKey가 지우고 재시도를 허용하므로, 이 마킹이 없으면 방금 만든
    // queued row가 Bitbucket 재시도까지 duplicate로 삼켜 PR이 무응답으로 남는다.
    try {
      await this.reviewQueue.add("review", jobData, {
        jobId,
        attempts: settings.retryAttempts,
        backoff: {
          type: "exponential",
          delay: settings.retryDelay,
        },
      });
    } catch (err) {
      await this.reviewService.updateStatus(
        reviewRun.id,
        ReviewRunStatus.FAILED,
        { errorMessage: `Failed to enqueue: ${(err as Error).message}` },
      );
      throw err;
    }

    this.logger.log(
      `Review queued: PR #${prPayload.pullRequestId} @ ${prPayload.headCommitHash.substring(0, 7)}`,
    );

    return { accepted: true };
  }

  private buildProgressMessage(settings: IReviewSettingsSnapshot): string {
    const reasoningLine = settings.reasoningEffort
      ? `\n- Reasoning: ${settings.reasoningEffort}`
      : "";
    return `⏳ Summary & Code Review 진행 중...\n\n- Model: ${settings.model}${reasoningLine}`;
  }

  /** Fire-and-forget: reply to trigger comment */
  private postInProgressReply(
    prPayload: IWebhookPrPayload,
    parentCommentId: number,
    settings: IReviewSettingsSnapshot,
    credentials: IBitbucketCredentialSnapshot,
  ): void {
    this.bitbucketService
      .replyToComment({
        workspace: prPayload.workspaceSlug,
        repoSlug: prPayload.repositorySlug,
        pullRequestId: prPayload.pullRequestId,
        parentCommentId,
        body: this.buildProgressMessage(settings),
      }, credentials)
      .catch((err) => {
        this.logger.error(
          `Failed to post in-progress reply: ${(err as Error).message}`,
        );
      });
  }

  /** Fire-and-forget: top-level in-progress comment */
  private postInProgressComment(
    prPayload: IWebhookPrPayload,
    settings: IReviewSettingsSnapshot,
    credentials: IBitbucketCredentialSnapshot,
  ): void {
    this.bitbucketService
      .createComment({
        workspace: prPayload.workspaceSlug,
        repoSlug: prPayload.repositorySlug,
        pullRequestId: prPayload.pullRequestId,
        body: this.buildProgressMessage(settings),
      }, credentials)
      .catch((err) => {
        this.logger.error(
          `Failed to post in-progress comment: ${(err as Error).message}`,
        );
      });
  }

  private extractPrPayload(
    body: IBitbucketWebhookBase,
    identity: IRepositoryIdentity,
  ): IWebhookPrPayload {
    // Validate required nested fields
    if (!body.pullrequest?.id || !body.pullrequest?.source?.commit?.hash) {
      throw new BadRequestException(
        "Missing required fields: pullrequest.id, pullrequest.source.commit.hash",
      );
    }
    if (!body.pullrequest?.destination?.branch?.name) {
      throw new BadRequestException(
        "Missing required field: pullrequest.destination.branch.name",
      );
    }
    if (!body.repository?.full_name) {
      throw new BadRequestException("Missing required field: repository.full_name");
    }

    const cloneUrl = `https://bitbucket.org/${encodeURIComponent(identity.workspaceSlug)}/${encodeURIComponent(identity.repositorySlug)}.git`;


    return {
      ...identity,
      pullRequestId: body.pullrequest.id,
      headCommitHash: body.pullrequest.source.commit.hash,
      baseCommitHash: body.pullrequest.destination.commit.hash,
      baseBranch: body.pullrequest.destination.branch.name,
      headBranch: body.pullrequest.source.branch.name,
      cloneUrl,
    };
  }
}
