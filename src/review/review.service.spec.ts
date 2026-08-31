import {
  ReviewRunEntity,
  ReviewRunStatus,
  TriggerType,
} from "../entities/review-run.entity";
import {
  type IRecentReview,
  type IRepoStatsOverview,
  ReviewService,
  sanitizeErrorMessage,
} from "./review.service";

jest.mock("@lib/logger", () => ({
  ServiceLogger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  })),
}));

describe("ReviewService stats", () => {
  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(),
  };

  let service: ReviewService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReviewService(mockRepository as never);
  });

  it("should return repo stats overview for a single repository", async () => {
    mockRepository.query
      .mockResolvedValueOnce([
        {
          repositorySlug: "repo-a",
          totalCount: "4",
          completedCount: "2",
          failedCount: "1",
          supersededCount: "1",
          codexTotalMs: "3500",
          codexAvgMs: "1750",
          reviewTotalMs: "4100",
          reviewAvgMs: "2050",
          inputTokens: "1000",
          cachedInputTokens: "250",
          outputTokens: "120",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 99,
          repositorySlug: "repo-a",
          pullRequestId: 17,
          reviewStatus: ReviewRunStatus.COMPLETED,
          durationMs: 1400,
          totalDurationMs: 1600,
          inputTokens: 400,
          cachedInputTokens: 100,
          outputTokens: 40,
          createdAt: new Date("2026-04-09T00:00:00.000Z"),
        },
      ]);

    const result = await service.getRepoStats("repo-a");

    expect(result).toEqual<IRepoStatsOverview>({
      repoSlug: "repo-a",
      counts: {
        total: 4,
        completed: 2,
        failed: 1,
        superseded: 1,
      },
      durations: {
        codexTotalMs: 3500,
        codexAvgMs: 1750,
        reviewTotalMs: 4100,
        reviewAvgMs: 2050,
      },
      tokens: {
        inputTokens: 1000,
        cachedInputTokens: 250,
        outputTokens: 120,
        totalTokens: 1120,
      },
      latestReview: {
        id: 99,
        repositorySlug: "repo-a",
        pullRequestId: 17,
        reviewStatus: ReviewRunStatus.COMPLETED,
        durationMs: 1400,
        totalDurationMs: 1600,
        inputTokens: 400,
        cachedInputTokens: 100,
        outputTokens: 40,
        createdAt: new Date("2026-04-09T00:00:00.000Z"),
      } as ReviewRunEntity,
    });
  });

  it("should list repo stats ordered by latest review date desc", async () => {
    mockRepository.query
      .mockResolvedValueOnce([
        {
          repositorySlug: "repo-b",
          totalCount: "2",
          completedCount: "1",
          failedCount: "1",
          supersededCount: "0",
          codexTotalMs: "500",
          codexAvgMs: "500",
          reviewTotalMs: "700",
          reviewAvgMs: "700",
          inputTokens: "300",
          cachedInputTokens: "0",
          outputTokens: "20",
        },
        {
          repositorySlug: "repo-a",
          totalCount: "1",
          completedCount: "1",
          failedCount: "0",
          supersededCount: "0",
          codexTotalMs: "400",
          codexAvgMs: "400",
          reviewTotalMs: "550",
          reviewAvgMs: "550",
          inputTokens: "200",
          cachedInputTokens: "50",
          outputTokens: "10",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 20,
          repositorySlug: "repo-a",
          pullRequestId: 1,
          reviewStatus: ReviewRunStatus.COMPLETED,
          createdAt: new Date("2026-04-08T00:00:00.000Z"),
        },
        {
          id: 21,
          repositorySlug: "repo-b",
          pullRequestId: 2,
          reviewStatus: ReviewRunStatus.FAILED,
          createdAt: new Date("2026-04-09T00:00:00.000Z"),
        },
      ]);

    const result = await service.listRepoStats();

    expect(result.map((item) => item.repoSlug)).toEqual(["repo-b", "repo-a"]);
    expect(result[0].latestReview?.id).toBe(21);
    expect(result[0].tokens.totalTokens).toBe(320);
    expect(result[1].tokens.totalTokens).toBe(210);
  });
});

describe("ReviewService idempotency", () => {
  const mockRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  let service: ReviewService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReviewService(mockRepository as never);
  });

  it("deletes a failed run without a result comment to allow retry", async () => {
    mockRepository.findOne.mockResolvedValueOnce({
      id: 7,
      reviewStatus: ReviewRunStatus.FAILED,
      resultCommentId: null,
    });

    await expect(service.existsByIdempotencyKey("repo:1:commit")).resolves.toBe(
      false,
    );

    expect(mockRepository.findOne).toHaveBeenCalledWith({
      where: { idempotencyKey: "repo:1:commit" },
      select: ["id", "reviewStatus", "resultCommentId"],
    });
    expect(mockRepository.delete).toHaveBeenCalledWith(7);
  });

  it("keeps a failed run with a result comment and treats it as duplicate", async () => {
    mockRepository.findOne.mockResolvedValueOnce({
      id: 8,
      reviewStatus: ReviewRunStatus.FAILED,
      resultCommentId: 321,
    });

    await expect(service.existsByIdempotencyKey("repo:1:commit")).resolves.toBe(
      true,
    );

    expect(mockRepository.delete).not.toHaveBeenCalled();
  });

  it("keeps a publishing run without a result comment as a duplicate", async () => {
    mockRepository.findOne.mockResolvedValueOnce({
      id: 9,
      reviewStatus: ReviewRunStatus.PUBLISHING,
      resultCommentId: null,
    });

    await expect(service.existsByIdempotencyKey("repo:1:commit")).resolves.toBe(
      true,
    );

    expect(mockRepository.delete).not.toHaveBeenCalled();
  });

  it("waits for the result comment ID update without changing status", async () => {
    let releaseUpdate: (() => void) | undefined;
    const updatePending = new Promise<void>((resolve) => {
      releaseUpdate = resolve;
    });
    mockRepository.update.mockReturnValueOnce(updatePending);
    let serviceCallSettled = false;

    const serviceCall = service.updateResultCommentId(9, 654).then(() => {
      serviceCallSettled = true;
    });
    await Promise.resolve();

    expect(mockRepository.update).toHaveBeenCalledWith(9, {
      resultCommentId: 654,
    });
    expect(serviceCallSettled).toBe(false);

    releaseUpdate?.();
    await serviceCall;
    expect(serviceCallSettled).toBe(true);
  });

  it("propagates a result comment ID update rejection", async () => {
    const error = new Error("database unavailable");
    mockRepository.update.mockRejectedValueOnce(error);

    await expect(service.updateResultCommentId(9, 654)).rejects.toBe(error);
  });
});

describe("ReviewService.listRecent", () => {
  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(),
  };

  let service: ReviewService;

  const buildRow = (overrides: Partial<ReviewRunEntity> = {}): ReviewRunEntity =>
    ({
      id: 1,
      repositorySlug: "repo-a",
      pullRequestId: 11,
      headCommitHash: "abc1234",
      reviewStatus: ReviewRunStatus.COMPLETED,
      triggerType: TriggerType.MENTION,
      errorMessage: null,
      inputTokens: 100,
      cachedInputTokens: 20,
      outputTokens: 30,
      durationMs: 500,
      totalDurationMs: 700,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      reviewOutput: "secret-internal-content-should-not-leak",
      ...overrides,
    }) as unknown as ReviewRunEntity;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReviewService(mockRepository as never);
  });

  it("returns empty array when repository has no rows", async () => {
    mockRepository.find.mockResolvedValueOnce([]);

    const result = await service.listRecent(10);

    expect(result).toEqual([]);
    expect(mockRepository.find).toHaveBeenCalledWith({
      order: { createdAt: "DESC" },
      take: 10,
    });
  });

  it("maps rows preserving order returned by the repository (DESC)", async () => {
    const newer = buildRow({
      id: 2,
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
    } as Partial<ReviewRunEntity>);
    const older = buildRow({
      id: 1,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
    } as Partial<ReviewRunEntity>);
    mockRepository.find.mockResolvedValueOnce([newer, older]);

    const result = await service.listRecent(5);

    expect(result.map((item) => item.id)).toEqual([2, 1]);
    expect(mockRepository.find).toHaveBeenCalledWith({
      order: { createdAt: "DESC" },
      take: 5,
    });
  });

  it("uses default limit (10) when limit is omitted", async () => {
    mockRepository.find.mockResolvedValueOnce([]);

    await service.listRecent();

    expect(mockRepository.find).toHaveBeenCalledWith({
      order: { createdAt: "DESC" },
      take: 10,
    });
  });

  it("clamps limit below minimum (0 -> 1)", async () => {
    mockRepository.find.mockResolvedValueOnce([]);

    await service.listRecent(0);

    expect(mockRepository.find).toHaveBeenCalledWith({
      order: { createdAt: "DESC" },
      take: 1,
    });
  });

  it("clamps limit above maximum (100 -> 50)", async () => {
    mockRepository.find.mockResolvedValueOnce([]);

    await service.listRecent(100);

    expect(mockRepository.find).toHaveBeenCalledWith({
      order: { createdAt: "DESC" },
      take: 50,
    });
  });

  it("does NOT include reviewOutput key in the response (whitelist regression)", async () => {
    mockRepository.find.mockResolvedValueOnce([buildRow()]);

    const result = await service.listRecent(10);

    expect(result).toHaveLength(1);
    for (const row of result) {
      expect(Object.keys(row)).not.toContain("reviewOutput");
      expect(
        (row as unknown as Record<string, unknown>).reviewOutput,
      ).toBeUndefined();
    }
  });

  it("sanitizes errorMessage in the mapped row", async () => {
    mockRepository.find.mockResolvedValueOnce([
      buildRow({
        errorMessage:
          "spawn failed at /var/lib/codex/work/run.sh contact dev@example.com",
      } as Partial<ReviewRunEntity>),
    ]);

    const result = await service.listRecent(10);

    expect(result[0].errorMessage).toBe(
      "spawn failed at [path] contact [email]",
    );
  });
});

describe("sanitizeErrorMessage", () => {
  it("returns null for null/undefined/empty", () => {
    expect(sanitizeErrorMessage(null)).toBeNull();
    expect(sanitizeErrorMessage(undefined)).toBeNull();
    expect(sanitizeErrorMessage("")).toBeNull();
    expect(sanitizeErrorMessage("   ")).toBeNull();
  });

  it("masks absolute filesystem paths", () => {
    const out = sanitizeErrorMessage(
      "ENOENT at /var/lib/codex/worktree/abc/run.log",
    );
    expect(out).toBe("ENOENT at [path]");
  });

  it("masks UUIDs", () => {
    const out = sanitizeErrorMessage(
      "request id 1f3a4b5c-8d2e-4a6b-9c0d-1234567890ab failed",
    );
    expect(out).toBe("request id [uuid] failed");
  });

  it("masks 40-char git SHAs", () => {
    const out = sanitizeErrorMessage(
      "head commit aaaabbbbccccddddeeeeffff0000111122223333 missing",
    );
    expect(out).toBe("head commit [sha] missing");
  });

  it("masks email addresses", () => {
    const out = sanitizeErrorMessage("notify dev@example.com please");
    expect(out).toBe("notify [email] please");
  });

  it("masks multiple sensitive tokens in one message", () => {
    const out = sanitizeErrorMessage(
      "fail /var/lib/foo with id 1f3a4b5c-8d2e-4a6b-9c0d-1234567890ab and sha aaaabbbbccccddddeeeeffff0000111122223333 mail dev@example.com",
    );
    expect(out).toBe(
      "fail [path] with id [uuid] and sha [sha] mail [email]",
    );
  });

  it("trims leading/trailing whitespace", () => {
    expect(sanitizeErrorMessage("  hello  ")).toBe("hello");
  });
});
