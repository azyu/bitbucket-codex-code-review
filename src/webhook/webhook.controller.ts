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
import {
  type IDuplicateReviewRun,
  ReviewService,
} from "../review/review.service";
import { IReviewJobData } from "../queue/interfaces/queue.interfaces";
import { BitbucketService } from "../bitbucket/bitbucket.service";
import { RuntimeSettingsService } from "../settings/runtime-settings.service";
import {
  type IBitbucketCredentialSnapshot,
  type IRepositoryIdentity,
  type IReviewSettingsSnapshot,
} from "../settings/runtime-settings.types";

/**
 * 아직 게시에 들어가지 않은 진행 상태 — 같은 커밋 재멘션에 "진행 중"으로 답하는 범위.
 * PUBLISHING은 회수 불가라 안내가 달라야 하므로 제외한다(buildDuplicateMessage 참고).
 * review.service.ts의 CLAIMABLE_BEFORE_PUBLISH와 같은 집합이지만, 게시 권한 판정과
 * 사용자 안내는 함께 움직여야 할 이유가 없어 각자 유지한다.
 */
const IN_FLIGHT_STATUSES: ReadonlyArray<ReviewRunStatus> = [
  ReviewRunStatus.QUEUED,
  ReviewRunStatus.PREPARING,
  ReviewRunStatus.REVIEWING,
];

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

    const { duplicate, ...result } = await this.enqueueReview(
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
    } else if (
      duplicate &&
      !forceReview &&
      // 일반 멘션의 key에는 댓글 ID가 없어 "새 멘션"과 "같은 웹훅의 재전송"이 같은
      // key로 들어온다. 기존 run을 만든 댓글과 같으면 재전송이므로 답글을 반복하지
      // 않는다 — 사람이 새로 멘션한 경우에만 ID가 달라진다.
      duplicate.triggerCommentId !== body.comment.id
    ) {
      // 멘션에만 답한다. pullrequest:updated는 제목/리뷰어 변경에도 같은 head
      // commit으로 날아오므로 AUTO 경로에서 같은 안내를 달면 PR마다 잡음이 쌓인다.
      // --force는 key가 댓글 단위라 중복 = 그 댓글의 웹훅 재전송뿐이다. 여기에
      // "--force를 쓰세요"라고 답하면 --force 댓글에 --force를 권하는 꼴이 된다.
      this.postDuplicateReply(
        prPayload,
        body.comment.id,
        await this.resolveDuplicateStatus(prPayload, duplicate),
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

    const { duplicate: _duplicate, ...result } =
      await this.enqueueReview(
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
  ): Promise<{
    accepted: boolean;
    reason?: string;
    duplicate?: IDuplicateReviewRun;
  }> {
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

    const duplicate = await this.reviewService.findDuplicateRun(idempotencyKey);
    if (duplicate) {
      this.logger.log(`Duplicate review request skipped: ${idempotencyKey}`);
      return { accepted: false, reason: "Duplicate request", duplicate };
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
    // findDuplicateRun가 지우고 재시도를 허용하므로, 이 마킹이 없으면 방금 만든
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

  private buildDuplicateMessage(
    duplicateStatus: ReviewRunStatus,
    headCommitHash: string,
  ): string {
    const shortHash = headCommitHash.substring(0, 7);
    // 게시 클레임 직후 죽은 런은 어떤 재시도로도 다시 클레임되지 않고(review.service.ts
    // claimStatus), --force가 만든 새 런의 supersede만이 그 행을 풀어준다. 다만 supersede는
    // DB 행만 바꿀 뿐 살아 있는 publishResults를 멈추지 못하므로(claimCompletion은 상태
    // 덮어쓰기만 막는다), 아직 게시 중인 런에 --force를 걸면 리뷰가 두 번 올라간다. 그래서 무조건
    // 권하지 않고, 죽은 런과 살아 있는 런을 가르는 관찰 가능한 증거(결과 댓글 유무)를 준다.
    if (duplicateStatus === ReviewRunStatus.PUBLISHING) {
      return `⏳ 이 커밋(\`${shortHash}\`)의 리뷰 결과를 게시하는 중입니다.\n\n결과 댓글이 이미 올라와 있으면 기다려 주세요 — 지금 \`@codex --force\` 를 쓰면 리뷰가 두 번 게시될 수 있습니다. 몇 분이 지나도 결과 댓글이 없으면 게시가 멈춘 것이므로 그때 \`@codex --force\` 로 복구하세요.`;
    }
    if (IN_FLIGHT_STATUSES.includes(duplicateStatus)) {
      return `⏳ 이 커밋(\`${shortHash}\`)에 대한 리뷰가 이미 진행 중입니다.`;
    }
    return `ℹ️ 마지막 리뷰 이후 코드 변경이 없습니다 (commit \`${shortHash}\`).\n\n같은 커밋을 다시 리뷰하려면 \`@codex --force\` 를 남겨주세요.`;
  }

  /**
   * 안내에 쓸 상태는 idempotency 행이 아니라 이 PR의 최신 런에서 읽는다. --force 런은
   * `-force-<댓글ID>` key를 쓰므로 idempotency 행에는 잡히지 않고, 그 행만 보면 force
   * 리뷰가 도는 중에도 "코드 변경이 없습니다 — --force 하세요"라고 답하게 된다.
   */
  private async resolveDuplicateStatus(
    prPayload: IWebhookPrPayload,
    duplicate: IDuplicateReviewRun,
  ): Promise<ReviewRunStatus> {
    const latest = await this.reviewService.findLatestByPr(
      prPayload.workspaceSlug,
      prPayload.repositorySlug,
      prPayload.pullRequestId,
    );
    // 최신 런이 다른 커밋의 것이면(헤드가 이미 이동한 뒤 옛 커밋의 웹훅이 도착) 이
    // 커밋을 설명하는 건 idempotency 행뿐이다.
    return latest?.headCommitHash === prPayload.headCommitHash
      ? latest.reviewStatus
      : duplicate.reviewStatus;
  }

  /** Fire-and-forget: 중복 트리거에 이유를 남긴다 (무응답이 고장으로 보이는 것을 막는다) */
  private postDuplicateReply(
    prPayload: IWebhookPrPayload,
    parentCommentId: number,
    duplicateStatus: ReviewRunStatus,
    credentials: IBitbucketCredentialSnapshot,
  ): void {
    this.bitbucketService
      .replyToComment({
        workspace: prPayload.workspaceSlug,
        repoSlug: prPayload.repositorySlug,
        pullRequestId: prPayload.pullRequestId,
        parentCommentId,
        body: this.buildDuplicateMessage(
          duplicateStatus,
          prPayload.headCommitHash,
        ),
      }, credentials)
      .catch((err) => {
        this.logger.error(
          `Failed to post duplicate reply: ${(err as Error).message}`,
        );
      });
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
