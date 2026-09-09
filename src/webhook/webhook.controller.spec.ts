import { BadRequestException } from "@nestjs/common";
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

const REVIEW_SETTINGS = {
  revision: "1:0",
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
  timeoutMs: 300_000,
  triggerMode: "mention" as const,
  customPrompt: "",
  retryAttempts: 3,
  retryDelay: 5000,
  cloneTimeoutMs: 600_000,
};
const BITBUCKET_CREDENTIALS = { apiTokens: [] };

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
    parseModelOverride: jest.fn(),
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
  const runtimeSettings = {
    resolveReviewSettings: jest.fn(),
    resolveJobCredentials: jest.fn(),
  };

  let controller: WebhookController;

  const buildPrWebhook = (
    overrides: Partial<IBitbucketPrWebhook> = {},
  ): IBitbucketPrWebhook =>
    ({
      repository: {
        full_name: "workspace/repo-a",
        slug: "repo-a",
        name: "repo-a",
        workspace: { slug: "workspace" },
        links: {
          clone: [
            {
              name: "https",
              href: "https://attacker.invalid/credential-capture.git",
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

  const verifiedIdentity = {
    verifiedWorkspaceSlug: "workspace",
    verifiedRepoSlug: "repo-a",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    runtimeSettings.resolveReviewSettings.mockResolvedValue(REVIEW_SETTINGS);
    runtimeSettings.resolveJobCredentials.mockResolvedValue({
      bitbucket: BITBUCKET_CREDENTIALS,
      openai: {},
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
    triggerService.parseModelOverride.mockReturnValue(undefined);

    controller = new WebhookController(
      reviewQueue as unknown as Queue,
      triggerService as unknown as TriggerService,
      reviewService as unknown as ReviewService,
      runtimeSettings as never,
      bitbucketService as unknown as BitbucketService,
    );
  });

  it("queues a mention-triggered review and replies to the trigger comment", async () => {
    const result = await controller.handleBitbucketWebhook(buildCommentWebhook(), "pullrequest:comment_created", verifiedIdentity);

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
        cloneUrl: "https://bitbucket.org/workspace/repo-a.git",
        triggerType: TriggerType.MENTION,
        triggerCommentId: 321,
        idempotencyKey: "workspace:repo-a:17:abcdef1234567890",
      }),
    );
    expect(reviewQueue.add).toHaveBeenCalledWith(
      "review",
      expect.objectContaining({
        reviewRunId: 99,
        triggerType: TriggerType.MENTION,
        triggerCommentId: 321,
        settings: REVIEW_SETTINGS,
      }),
      {
        jobId:
          "review-d29ya3NwYWNlOnJlcG8tYToxNzphYmNkZWYxMjM0NTY3ODkw",
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    );
    expect(bitbucketService.replyToComment).toHaveBeenCalledWith(
      {
        workspace: "workspace",
        repoSlug: "repo-a",
        pullRequestId: 17,
        parentCommentId: 321,
        body: "⏳ Summary & Code Review 진행 중...\n\n- Model: gpt-5.6-sol\n- Reasoning: high",
      },
      BITBUCKET_CREDENTIALS,
    );
  });

  it("forwards the comment model override to the job and the progress reply", async () => {
    triggerService.parseModelOverride.mockReturnValue("gpt-6-astra");

    await controller.handleBitbucketWebhook(buildCommentWebhook("@codex --model:gpt-6-astra"), "pullrequest:comment_created", verifiedIdentity);

    expect(reviewQueue.add).toHaveBeenCalledWith(
      "review",
      expect.objectContaining({
        settings: expect.objectContaining({ model: "gpt-6-astra" }),
      }),
      expect.anything(),
    );
    expect(bitbucketService.replyToComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "⏳ Summary & Code Review 진행 중...\n\n- Model: gpt-6-astra\n- Reasoning: high",
      }),
      BITBUCKET_CREDENTIALS,
    );
  });

  it("queues an auto-triggered review and posts a top-level progress comment", async () => {
    runtimeSettings.resolveReviewSettings.mockResolvedValueOnce({
      ...REVIEW_SETTINGS,
      triggerMode: "auto",
      reasoningEffort: "",
    });
    triggerService.shouldAutoReview.mockReturnValue(true);

    const result = await controller.handleBitbucketWebhook(buildPrWebhook(), "pullrequest:updated", verifiedIdentity);

    expect(result).toEqual({ accepted: true });
    expect(reviewService.createReviewRun).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerType: TriggerType.AUTO,
        triggerCommentId: undefined,
      }),
    );
    expect(bitbucketService.createComment).toHaveBeenCalledWith(
      {
        workspace: "workspace",
        repoSlug: "repo-a",
        pullRequestId: 17,
        body: "⏳ Summary & Code Review 진행 중...\n\n- Model: gpt-5.6-sol",
      },
      BITBUCKET_CREDENTIALS,
    );
  });

  it("returns duplicate when idempotency key already exists", async () => {
    reviewService.existsByIdempotencyKey.mockResolvedValue(true);

    const result = await controller.handleBitbucketWebhook(buildCommentWebhook(), "pullrequest:comment_created", verifiedIdentity);

    expect(result).toEqual({ accepted: false, reason: "Duplicate request" });
    expect(reviewQueue.add).not.toHaveBeenCalled();
    expect(bitbucketService.replyToComment).not.toHaveBeenCalled();
  });

  it("queues --force for an already reviewed commit with comment-scoped idempotency", async () => {
    const baseKey = "workspace:repo-a:17:abcdef1234567890";
    triggerService.isForceReview.mockReturnValue(true);
    triggerService.shouldMentionReview.mockReturnValue(false);
    reviewService.existsByIdempotencyKey.mockImplementation(
      async (key: string) => key === baseKey,
    );

    const result = await controller.handleBitbucketWebhook(buildCommentWebhook("@codex --force"), "pullrequest:comment_created", verifiedIdentity);

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
          "review-d29ya3NwYWNlOnJlcG8tYToxNzphYmNkZWYxMjM0NTY3ODkwLWZvcmNlLTMyMQ",
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    );
  });

  it.each([
    ["mention", "@codex", false],
    ["force", "@codex --force", true],
  ])("uses a colonless %s jobId", async (_name, raw, force) => {
    triggerService.isForceReview.mockReturnValue(force);

    await controller.handleBitbucketWebhook(buildCommentWebhook(raw), "pullrequest:comment_created", verifiedIdentity);

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
      controller.handleBitbucketWebhook(buildCommentWebhook(), "pullrequest:comment_created", verifiedIdentity),
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

    await controller.handleBitbucketWebhook(buildCommentWebhook(), "pullrequest:comment_created", verifiedIdentity);

    expect(reviewQueue.getJob).toHaveBeenNthCalledWith(
      1,
      "review-d29ya3NwYWNlOnJlcG8tYToxNzphYmNkZWYxMjM0NTY3ODkw",
    );
    expect(reviewQueue.getJob).toHaveBeenNthCalledWith(
      2,
      "workspace:repo-a:17:abcdef1234567890",
    );
    expect(removeCurrent).toHaveBeenCalled();
    expect(removeLegacy).toHaveBeenCalled();
    expect(reviewQueue.add).toHaveBeenCalled();
  });

  it("ignores comment events without a codex mention", async () => {
    triggerService.hasCodexMention.mockReturnValue(false);

    const result = await controller.handleBitbucketWebhook(buildCommentWebhook("please review"), "pullrequest:comment_created", verifiedIdentity);

    expect(result).toEqual({
      accepted: false,
      reason: "No @codex mention found",
    });
    expect(reviewQueue.add).not.toHaveBeenCalled();
  });
  it("keeps lifecycle identity separate for identical repo/PR/commit across workspaces", async () => {
    const original = buildCommentWebhook();
    const otherWorkspace: IBitbucketCommentWebhook = {
      ...original,
      repository: {
        ...original.repository,
        full_name: "other-workspace/repo-a",
        workspace: { slug: "other-workspace" },
      },
    };

    await controller.handleBitbucketWebhook(buildCommentWebhook(), "pullrequest:comment_created", verifiedIdentity);
    await controller.handleBitbucketWebhook(otherWorkspace, "pullrequest:comment_created", {
      verifiedWorkspaceSlug: "other-workspace",
      verifiedRepoSlug: "repo-a",
    });

    expect(reviewService.existsByIdempotencyKey).toHaveBeenNthCalledWith(
      1,
      "workspace:repo-a:17:abcdef1234567890",
    );
    expect(reviewService.existsByIdempotencyKey).toHaveBeenNthCalledWith(
      2,
      "other-workspace:repo-a:17:abcdef1234567890",
    );
    expect(reviewService.supersedeActivePrReviews).toHaveBeenNthCalledWith(
      1,
      "workspace",
      "repo-a",
      17,
      99,
    );
    expect(reviewService.supersedeActivePrReviews).toHaveBeenNthCalledWith(
      2,
      "other-workspace",
      "repo-a",
      17,
      99,
    );
    const jobIds = reviewQueue.add.mock.calls.map((call) => call[2].jobId);
    expect(new Set(jobIds).size).toBe(2);
  });


  it("rejects requests without the guard-produced repository identity", async () => {
    await expect(
      controller.handleBitbucketWebhook(
        buildCommentWebhook(),
        "pullrequest:comment_created",
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects comment events missing required comment fields", async () => {
    await expect(
      controller.handleBitbucketWebhook({
        ...buildCommentWebhook(),
        comment: { id: 0, content: { raw: "" } },
      } as IBitbucketCommentWebhook, "pullrequest:comment_created", verifiedIdentity),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects PR payloads missing required nested fields", async () => {
    triggerService.shouldAutoReview.mockReturnValue(true);

    await expect(
      controller.handleBitbucketWebhook(buildPrWebhook({
        pullrequest: {
          ...buildPrWebhook().pullrequest,
          destination: {
            commit: { hash: "base123" },
            branch: { name: "" },
          },
        },
      } as Partial<IBitbucketPrWebhook>), "pullrequest:created", verifiedIdentity),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("ignores unsupported events", async () => {
    const result = await controller.handleBitbucketWebhook(buildPrWebhook(), "repo:push", verifiedIdentity);

    expect(result).toEqual({
      accepted: false,
      reason: "Ignored event: repo:push",
    });
    expect(reviewQueue.add).not.toHaveBeenCalled();
  });
});
