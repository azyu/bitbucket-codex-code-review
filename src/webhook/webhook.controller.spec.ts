import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { BitbucketService } from "../bitbucket/bitbucket.service";
import { TriggerType } from "../entities/review-run.entity";
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
  };
  const reviewService = {
    existsByIdempotencyKey: jest.fn(),
    createReviewRun: jest.fn(),
    supersedeActivePrReviews: jest.fn(),
  };
  const bitbucketService = {
    createComment: jest.fn(),
    replyToComment: jest.fn(),
  };
  const configValues: Record<string, unknown> = {
    "trigger.mode": "mention",
    "codex.model": "gpt-5.5",
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
      "codex.model": "gpt-5.5",
      "codex.reasoningEffort": "high",
    });
    reviewQueue.getJob.mockResolvedValue(null);
    reviewQueue.add.mockResolvedValue(undefined);
    reviewService.existsByIdempotencyKey.mockResolvedValue(false);
    reviewService.createReviewRun.mockResolvedValue({ id: 99 });
    reviewService.supersedeActivePrReviews.mockResolvedValue(undefined);
    bitbucketService.createComment.mockResolvedValue({ id: 1 });
    bitbucketService.replyToComment.mockResolvedValue({ id: 2 });
    triggerService.shouldAutoReview.mockReturnValue(false);
    triggerService.shouldMentionReview.mockReturnValue(true);
    triggerService.hasCodexMention.mockReturnValue(true);

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
      { jobId: "repo-a:17:abcdef1234567890" },
    );
    expect(bitbucketService.replyToComment).toHaveBeenCalledWith({
      workspace: "workspace",
      repoSlug: "repo-a",
      pullRequestId: 17,
      parentCommentId: 321,
      body: "⏳ Summary & Code Review 진행 중...\n\n- Model: gpt-5.5\n- Reasoning: high",
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
      body: "⏳ Summary & Code Review 진행 중...\n\n- Model: gpt-5.5",
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

  it("removes stale queued job before adding the new review job", async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    reviewQueue.getJob.mockResolvedValue({ remove });

    await controller.handleBitbucketWebhook(
      buildCommentWebhook(),
      "pullrequest:comment_created",
      {},
    );

    expect(reviewQueue.getJob).toHaveBeenCalledWith(
      "repo-a:17:abcdef1234567890",
    );
    expect(remove).toHaveBeenCalled();
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
