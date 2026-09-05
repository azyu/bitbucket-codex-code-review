import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { BitbucketService } from "../bitbucket/bitbucket.service";
import { ReviewRunStatus, TriggerType } from "../entities/review-run.entity";
import { ReviewService } from "../review/review.service";
import { TriggerService } from "./trigger.service";
import { WebhookController } from "./webhook.controller";
import {
  IBitbucketCommentWebhook,
  IBitbucketPrWebhook,
} from "./interfaces/webhook.interfaces";

jest.mock("@lib/logger", () => ({
  ServiceLogger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  })),
}));

describe("WebhookController", () => {
  const reviewQueue = {
    add: jest.fn(),
    getJob: jest.fn(),
  };
  const triggerService = {
    shouldAutoReview: jest.fn(),
    shouldMentionReview: jest.fn(),
    hasCodexMention: jest.fn(),
    isForceReview: jest.fn(),
  };
  const reviewService = {
    existsByIdempotencyKey: jest.fn(),
    createReviewRun: jest.fn(),
    supersedeActivePrReviews: jest.fn(),
    updateStatus: jest.fn(),
  };
  const bitbucketService = {
    createComment: jest.fn(),
    replyToComment: jest.fn(),
  };
  const configValues: Record<string, unknown> = {
    "trigger.mode": "mention",
    "codex.model": "gpt-6-astra",
    "codex.reasoningEffort": "high",
  };
  const configService = {
    get: jest.fn((key: string, defaultValue?: unknown) =>
      key in configValues ? configValues[key] : defaultValue,
    ),
    getOrThrow: jest.fn((key: string) => configValues[key]),
  };

  let controller: WebhookController;

  const buildPrWebhook = (
    overrides: Partial<IBitbucketPrWebhook> = {},
  ): IBitbucketPrWebhook =>
    ({
      repository: {
        full_name: "workspace/repo-a",
        name: "repo-a",
        workspace: { slug: "workspace" },
        links: {
          clone: [
            {
              name: "https",
              href: "https://bitbucket.org/workspace/repo-a.git",
            },
          ],
        },
      },
      pullrequest: {
        id: 17,
        source: {
          branch: { name: "feature" },
          commit: { hash: "abcdef1234567890" },
        },
        destination: {
          branch: { name: "main" },
          commit: { hash: "base123" },
        },
      },
      ...overrides,
    }) as IBitbucketPrWebhook;

  const buildCommentWebhook = (
    commentRaw = "@codex review this",
  ): IBitbucketCommentWebhook =>
    ({
      ...buildPrWebhook(),
      comment: {
        id: 321,
        content: { raw: commentRaw },
      },
    }) as IBitbucketCommentWebhook;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(configValues, {
      "trigger.mode": "mention",
      "codex.model": "gpt-6-astra",
      "codex.reasoningEffort": "high",
    });
    reviewQueue.getJob.mockResolvedValue(null);
    reviewQueue.add.mockResolvedValue(undefined);
    reviewService.existsByIdempotencyKey.mockResolvedValue(false);
    reviewService.createReviewRun.mockResolvedValue({ id: 99 });
    reviewService.supersedeActivePrReviews.mockResolvedValue(undefined);
    reviewService.updateStatus.mockResolvedValue(undefined);
    bitbucketService.createComment.mockResolvedValue({ id: 1 });
    bitbucketService.replyToComment.mockResolvedValue({ id: 2 });
    triggerService.shouldAutoReview.mockReturnValue(false);
    triggerService.shouldMentionReview.mockReturnValue(true);
    triggerService.hasCodexMention.mockReturnValue(true);
    triggerService.isForceReview.mockReturnValue(false);

    controller = new WebhookController(
      reviewQueue as unknown as Queue,
      triggerService as unknown as TriggerService,
      reviewService as unknown as ReviewService,
      configService as unknown as ConfigService,
      bitbucketService as unknown as BitbucketService,
    );
  });

  it("queues a mention-triggered review and replies to the trigger comment", async () => {
    const result = await controller.handleBitbucketWebhook(
      buildCommentWebhook(),
      "pullrequest:comment_created",
      {},
    );

    expect(result).toEqual({ accepted: true });
    expect(reviewService.createReviewRun).toHaveBeenCalledWith(
      expect.objectContaining({
        repositorySlug: "repo-a",
        workspaceSlug: "workspace",
        pullRequestId: 17,
        headCommitHash: "abcdef1234567890",
        baseCommitHash: "base123",
        baseBranch: "main",
        headBranch: "feature",
        triggerType: TriggerType.MENTION,
        triggerCommentId: 321,
        idempotencyKey: "repo-a:17:abcdef1234567890",
      }),
    );
    expect(reviewQueue.add).toHaveBeenCalledWith(
      "review",
      expect.objectContaining({
        reviewRunId: 99,
        triggerType: TriggerType.MENTION,
        triggerCommentId: 321,
      }),
      { jobId: "review-cmVwby1hOjE3OmFiY2RlZjEyMzQ1Njc4OTA" },
    );
    expect(bitbucketService.replyToComment).toHaveBeenCalledWith({
      workspace: "workspace",
      repoSlug: "repo-a",
      pullRequestId: 17,
      parentCommentId: 321,
      body: "⏳ Summary & Code Review 진행 중...\n\n- Model: gpt-6-astra\n- Reasoning: high",
    });
  });

  it("queues an auto-triggered review and posts a top-level progress comment", async () => {
    configValues["trigger.mode"] = "auto";
    configValues["codex.reasoningEffort"] = "";
    triggerService.shouldAutoReview.mockReturnValue(true);

    const result = await controller.handleBitbucketWebhook(
      buildPrWebhook(),
      "pullrequest:updated",
      {},
    );

    expect(result).toEqual({ accepted: true });
    expect(reviewService.createReviewRun).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerType: TriggerType.AUTO,
        triggerCommentId: undefined,
      }),
    );
    expect(bitbucketService.createComment).toHaveBeenCalledWith({
      workspace: "workspace",
      repoSlug: "repo-a",
      pullRequestId: 17,
      body: "⏳ Summary & Code Review 진행 중...\n\n- Model: gpt-6-astra",
    });
  });

  it("returns duplicate when idempotency key already exists", async () => {
    reviewService.existsByIdempotencyKey.mockResolvedValue(true);

    const result = await controller.handleBitbucketWebhook(
      buildCommentWebhook(),
      "pullrequest:comment_created",
      {},
    );

    expect(result).toEqual({ accepted: false, reason: "Duplicate request" });
    expect(reviewQueue.add).not.toHaveBeenCalled();
    expect(bitbucketService.replyToComment).not.toHaveBeenCalled();
  });

  it("queues --force for an already reviewed commit with comment-scoped idempotency", async () => {
    const baseKey = "repo-a:17:abcdef1234567890";
    triggerService.isForceReview.mockReturnValue(true);
    triggerService.shouldMentionReview.mockReturnValue(false);
    reviewService.existsByIdempotencyKey.mockImplementation(
      async (key: string) => key === baseKey,
    );

    const result = await controller.handleBitbucketWebhook(
      buildCommentWebhook("@codex --force"),
      "pullrequest:comment_created",
      {},
    );

    const forceKey = `${baseKey}-force-321`;
    expect(result).toEqual({ accepted: true });
    expect(reviewService.existsByIdempotencyKey).toHaveBeenCalledWith(forceKey);
    expect(reviewService.createReviewRun).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: forceKey }),
    );
    expect(reviewQueue.add).toHaveBeenCalledWith(
      "review",
      expect.objectContaining({ idempotencyKey: forceKey }),
      {
        jobId:
          "review-cmVwby1hOjE3OmFiY2RlZjEyMzQ1Njc4OTAtZm9yY2UtMzIx",
      },
    );
  });

  it.each([
    ["mention", "@codex", false],
    ["force", "@codex --force", true],
  ])("uses a colonless %s jobId", async (_name, raw, force) => {
    triggerService.isForceReview.mockReturnValue(force);

    await controller.handleBitbucketWebhook(
      buildCommentWebhook(raw),
      "pullrequest:comment_created",
      {},
    );

    const [, , opts] = reviewQueue.add.mock.calls[0] as [
      string,
      unknown,
      { jobId: string },
    ];
    expect(opts.jobId).not.toContain(":");
  });

  it("marks the review run failed when enqueueing throws", async () => {
    const enqueueError = new Error("Custom Id cannot contain :");
    reviewQueue.add.mockRejectedValue(enqueueError);

    await expect(
      controller.handleBitbucketWebhook(
        buildCommentWebhook(),
        "pullrequest:comment_created",
        {},
      ),
    ).rejects.toThrow(enqueueError);

    // FAILED + 게시 증거 없음이어야 existsByIdempotencyKey가 row를 지우고
    // Bitbucket 재시도를 통과시킨다. queued로 남으면 재시도가 duplicate로 삼켜진다.
    expect(reviewService.updateStatus).toHaveBeenCalledWith(
      99,
      ReviewRunStatus.FAILED,
      expect.objectContaining({
        errorMessage: expect.stringContaining("Failed to enqueue"),
      }),
    );
    expect(bitbucketService.replyToComment).not.toHaveBeenCalled();
  });

  it("removes current and legacy stale jobs during the jobId transition", async () => {
    const removeCurrent = jest.fn().mockResolvedValue(undefined);
    const removeLegacy = jest.fn().mockResolvedValue(undefined);
    reviewQueue.getJob
      .mockResolvedValueOnce({ remove: removeCurrent })
      .mockResolvedValueOnce({ remove: removeLegacy });

    await controller.handleBitbucketWebhook(
      buildCommentWebhook(),
      "pullrequest:comment_created",
      {},
    );

    expect(reviewQueue.getJob).toHaveBeenNthCalledWith(
      1,
      "review-cmVwby1hOjE3OmFiY2RlZjEyMzQ1Njc4OTA",
    );
    expect(reviewQueue.getJob).toHaveBeenNthCalledWith(
      2,
      "repo-a:17:abcdef1234567890",
    );
    expect(removeCurrent).toHaveBeenCalled();
    expect(removeLegacy).toHaveBeenCalled();
    expect(reviewQueue.add).toHaveBeenCalled();
  });

  it("ignores comment events without a codex mention", async () => {
    triggerService.hasCodexMention.mockReturnValue(false);

    const result = await controller.handleBitbucketWebhook(
      buildCommentWebhook("please review"),
      "pullrequest:comment_created",
      {},
    );

    expect(result).toEqual({
      accepted: false,
      reason: "No @codex mention found",
    });
    expect(reviewQueue.add).not.toHaveBeenCalled();
  });

  it("rejects a verified repo slug that does not match the payload slug", async () => {
    await expect(
      controller.handleBitbucketWebhook(
        buildCommentWebhook(),
        "pullrequest:comment_created",
        { verifiedRepoSlug: "repo-b" },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects comment events missing required comment fields", async () => {
    await expect(
      controller.handleBitbucketWebhook(
        {
          ...buildCommentWebhook(),
          comment: { id: 0, content: { raw: "" } },
        } as IBitbucketCommentWebhook,
        "pullrequest:comment_created",
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects PR payloads missing required nested fields", async () => {
    triggerService.shouldAutoReview.mockReturnValue(true);

    await expect(
      controller.handleBitbucketWebhook(
        buildPrWebhook({
          pullrequest: {
            ...buildPrWebhook().pullrequest,
            destination: {
              commit: { hash: "base123" },
              branch: { name: "" },
            },
          },
        } as Partial<IBitbucketPrWebhook>),
        "pullrequest:created",
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("ignores unsupported events", async () => {
    const result = await controller.handleBitbucketWebhook(
      buildPrWebhook(),
      "repo:push",
      {},
    );

    expect(result).toEqual({
      accepted: false,
      reason: "Ignored event: repo:push",
    });
    expect(reviewQueue.add).not.toHaveBeenCalled();
  });
});
