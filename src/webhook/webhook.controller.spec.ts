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
    findDuplicateStatus: jest.fn(),
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
    reviewService.findDuplicateStatus.mockResolvedValue(null);
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

  it("tells the mention author that nothing changed since the last review", async () => {
    reviewService.findDuplicateStatus.mockResolvedValue(
      ReviewRunStatus.COMPLETED,
    );

    const result = await controller.handleBitbucketWebhook(buildCommentWebhook(), "pullrequest:comment_created", verifiedIdentity);

    // 무응답이면 사용자는 고장과 구분할 수 없다 — 이유와 탈출구(--force)를 같이 남긴다.
    expect(result).toEqual({ accepted: false, reason: "Duplicate request" });
    expect(reviewQueue.add).not.toHaveBeenCalled();
    expect(bitbucketService.replyToComment).toHaveBeenCalledWith(
      {
        workspace: "workspace",
        repoSlug: "repo-a",
        pullRequestId: 17,
        parentCommentId: 321,
        body:
          "ℹ️ 마지막 리뷰 이후 코드 변경이 없습니다 (commit `abcdef1`).\n\n같은 커밋을 다시 리뷰하려면 `@codex --force` 를 남겨주세요.",
      },
      BITBUCKET_CREDENTIALS,
    );
  });

  it("does not arm its own duplicate reply as a codex trigger", async () => {
    reviewService.findDuplicateStatus.mockResolvedValue(
      ReviewRunStatus.COMPLETED,
    );

    await controller.handleBitbucketWebhook(buildCommentWebhook(), "pullrequest:comment_created", verifiedIdentity);

    // Bitbucket은 봇이 만든 댓글에도 comment_created를 보내고, 컨트롤러는 작성자를
    // 보지 않는다. 답글 본문이 트리거로 읽히면 중복 멘션마다 강제 리뷰가 하나씩 돈다.
    // 지금 이를 막는 것은 `@codex --force`를 감싼 백틱뿐이므로, 문구를 다듬다 백틱이
    // 빠지면 여기서 깨져야 한다. mock이 아닌 실제 TriggerService로 검사한다.
    const [{ body }] = bitbucketService.replyToComment.mock
      .calls[0] as [{ body: string }];
    const realTrigger = new TriggerService();
    expect(realTrigger.hasCodexMention(body)).toBe(false);
    expect(realTrigger.isForceReview(body)).toBe(false);
  });

  it("tells the mention author a review for the same commit is still running", async () => {
    reviewService.findDuplicateStatus.mockResolvedValue(
      ReviewRunStatus.REVIEWING,
    );

    await controller.handleBitbucketWebhook(buildCommentWebhook(), "pullrequest:comment_created", verifiedIdentity);

    // 진행 중인 런에 "코드 변경이 없습니다"라고 답하면 거짓 안내가 된다.
    expect(bitbucketService.replyToComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "⏳ 이 커밋(`abcdef1`)에 대한 리뷰가 이미 진행 중입니다.",
      }),
      BITBUCKET_CREDENTIALS,
    );
  });

  it("gates the --force recovery on evidence that publishing is stuck", async () => {
    reviewService.findDuplicateStatus.mockResolvedValue(
      ReviewRunStatus.PUBLISHING,
    );

    await controller.handleBitbucketWebhook(buildCommentWebhook(), "pullrequest:comment_created", verifiedIdentity);

    // PUBLISHING은 claimStatus의 from-set 밖이라 재시도로 회수되지 않으므로 복구 수단을
    // 알려야 한다. 다만 살아 있는 publishResults는 supersede로 멈추지 않아 무조건 권하면
    // 중복 게시를 부른다 — 결과 댓글 유무라는 증거를 먼저 확인하게 만든다.
    const [{ body }] = bitbucketService.replyToComment.mock
      .calls[0] as [{ body: string }];
    expect(body).toContain("게시하는 중입니다");
    expect(body).toContain("결과 댓글이 이미 올라와 있으면 기다려 주세요");
    expect(body).toContain("두 번 게시될 수 있습니다");
    expect(body).toContain("`@codex --force`");
    expect(new TriggerService().isForceReview(body)).toBe(false);
  });

  it("stays silent when a --force mention webhook is redelivered", async () => {
    triggerService.isForceReview.mockReturnValue(true);
    reviewService.findDuplicateStatus.mockResolvedValue(
      ReviewRunStatus.COMPLETED,
    );

    await controller.handleBitbucketWebhook(buildCommentWebhook("@codex --force"), "pullrequest:comment_created", verifiedIdentity);

    // force key는 댓글 단위라 중복 = 재전송뿐 — `--force` 댓글에 `--force`를 권할 수 없다.
    expect(bitbucketService.replyToComment).not.toHaveBeenCalled();
  });

  it("stays silent on a duplicate auto trigger", async () => {
    triggerService.shouldAutoReview.mockReturnValue(true);
    reviewService.findDuplicateStatus.mockResolvedValue(
      ReviewRunStatus.COMPLETED,
    );

    // pullrequest:updated는 제목/리뷰어 변경에도 같은 head commit으로 날아온다.
    const result = await controller.handleBitbucketWebhook(buildPrWebhook(), "pullrequest:updated", verifiedIdentity);

    expect(result).toEqual({ accepted: false, reason: "Duplicate request" });
    expect(bitbucketService.createComment).not.toHaveBeenCalled();
    expect(bitbucketService.replyToComment).not.toHaveBeenCalled();
  });

  it("queues --force for an already reviewed commit with comment-scoped idempotency", async () => {
    const baseKey = "workspace:repo-a:17:abcdef1234567890";
    triggerService.isForceReview.mockReturnValue(true);
    triggerService.shouldMentionReview.mockReturnValue(false);
    reviewService.findDuplicateStatus.mockImplementation(
      async (key: string) =>
        key === baseKey ? ReviewRunStatus.COMPLETED : null,
    );

    const result = await controller.handleBitbucketWebhook(buildCommentWebhook("@codex --force"), "pullrequest:comment_created", verifiedIdentity);

    const forceKey = `${baseKey}-force-321`;
    expect(result).toEqual({ accepted: true });
    expect(reviewService.findDuplicateStatus).toHaveBeenCalledWith(forceKey);
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

    // FAILED + 게시 증거 없음이어야 findDuplicateStatus가 row를 지우고
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

    expect(reviewService.findDuplicateStatus).toHaveBeenNthCalledWith(
      1,
      "workspace:repo-a:17:abcdef1234567890",
    );
    expect(reviewService.findDuplicateStatus).toHaveBeenNthCalledWith(
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
