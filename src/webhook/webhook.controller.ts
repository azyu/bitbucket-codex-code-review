import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { ServiceLogger } from "@lib/logger";
import { REVIEW_QUEUE_NAME } from "../constants/queue.constants";
import { TriggerService } from "./trigger.service";
import { WebhookGuard } from "./webhook.guard";
import {
  IBitbucketCommentWebhook,
  IWebhookPrPayload,
} from "./interfaces/webhook.interfaces";
import { TriggerType } from "../entities/review-run.entity";
import { ReviewService } from "../review/review.service";
import { IReviewJobData } from "../queue/interfaces/queue.interfaces";
import { BitbucketService } from "../bitbucket/bitbucket.service";

@Controller("webhooks")
export class WebhookController {
  private readonly logger = new ServiceLogger(WebhookController.name);

  constructor(
    @InjectQueue(REVIEW_QUEUE_NAME) private readonly reviewQueue: Queue,
    private readonly triggerService: TriggerService,
    private readonly reviewService: ReviewService,
    private readonly configService: ConfigService,
    private readonly bitbucketService: BitbucketService,
  ) {}

  @Post("bitbucket")
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(WebhookGuard)
  async handleBitbucketWebhook(
    @Body() body: IBitbucketCommentWebhook,
    @Headers("x-event-key") eventKey: string,
  ): Promise<{ accepted: boolean; reason?: string }> {
    if (eventKey !== "pullrequest:comment_created") {
      return { accepted: false, reason: `Ignored event: ${eventKey}` };
    }

    if (!body.comment?.id || !body.comment?.content?.raw) {
      throw new BadRequestException(
        "Missing required fields: comment.id, comment.content.raw",
      );
    }

    const triggerMode = this.configService.get<string>(
      "trigger.mode",
      "mention",
    );
    const commentRaw = body.comment.content.raw;

    if (
      triggerMode === "mention" &&
      !this.triggerService.hasCodexMention(commentRaw)
    ) {
      return { accepted: false, reason: "No @codex mention found" };
    }

    const prPayload = this.extractPrPayload(body);
    const idempotencyKey = `${prPayload.repositorySlug}:${prPayload.pullRequestId}:${prPayload.headCommitHash}`;

    const isDuplicate =
      await this.reviewService.existsByIdempotencyKey(idempotencyKey);
    if (isDuplicate) {
      this.logger.log(`Duplicate review request skipped: ${idempotencyKey}`);
      return { accepted: false, reason: "Duplicate request" };
    }

    // Remove stale BullMQ job if it exists (e.g. from a previous failed attempt)
    try {
      const existingJob = await this.reviewQueue.getJob(idempotencyKey);
      if (existingJob) {
        await existingJob.remove();
        this.logger.log(`Removed stale BullMQ job: ${idempotencyKey}`);
      }
    } catch (err) {
      this.logger.error(
        `Failed to remove stale job: ${(err as Error).message}`,
      );
    }

    const reviewRun = await this.reviewService.createReviewRun({
      ...prPayload,
      idempotencyKey,
      triggerType: TriggerType.MENTION,
      triggerCommentId: body.comment.id,
    });

    // Supersede any active reviews for the same PR (e.g. new commit pushed)
    await this.reviewService.supersedeActivePrReviews(
      prPayload.repositorySlug,
      prPayload.pullRequestId,
      reviewRun.id,
    );

    // Post immediate "in progress" reply so the user knows the bot received the request
    const model = this.configService.getOrThrow<string>("codex.model");
    const reasoningEffort = this.configService.get<string>(
      "codex.reasoningEffort",
      "",
    );
    const reasoningLine = reasoningEffort
      ? `\n- Reasoning: ${reasoningEffort}`
      : "";
    this.bitbucketService
      .replyToComment({
        workspace: prPayload.workspaceSlug,
        repoSlug: prPayload.repositorySlug,
        pullRequestId: prPayload.pullRequestId,
        parentCommentId: body.comment.id,
        body: `⏳ Summary & Code Review 진행 중...\n\n- Model: ${model}${reasoningLine}`,
      })
      .catch((err) => {
        this.logger.error(
          `Failed to post in-progress reply: ${err.message}`,
        );
      });

    const jobData: IReviewJobData = {
      reviewRunId: reviewRun.id,
      ...prPayload,
      idempotencyKey,
      triggerType: TriggerType.MENTION,
      triggerCommentId: body.comment.id,
    };

    await this.reviewQueue.add("review", jobData, {
      jobId: idempotencyKey,
    });

    this.logger.log(
      `Review queued: PR #${prPayload.pullRequestId} @ ${prPayload.headCommitHash.substring(0, 7)}`,
    );

    return { accepted: true };
  }

  private extractPrPayload(body: IBitbucketCommentWebhook): IWebhookPrPayload {
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
    if (!body.repository?.full_name || !body.repository?.workspace?.slug) {
      throw new BadRequestException(
        "Missing required fields: repository.full_name, repository.workspace.slug",
      );
    }

    const cloneUrl =
      body.repository.links.clone?.find((l) => l.name === "https")?.href ||
      `https://bitbucket.org/${body.repository.full_name}.git`;

    const repositorySlug =
      body.repository.slug ||
      body.repository.full_name.split("/").pop() ||
      "";

    return {
      repositorySlug,
      workspaceSlug: body.repository.workspace.slug,
      pullRequestId: body.pullrequest.id,
      headCommitHash: body.pullrequest.source.commit.hash,
      baseCommitHash: body.pullrequest.destination.commit.hash,
      baseBranch: body.pullrequest.destination.branch.name,
      headBranch: body.pullrequest.source.branch.name,
      cloneUrl,
    };
  }
}
