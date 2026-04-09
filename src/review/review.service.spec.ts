import { ReviewRunEntity, ReviewRunStatus } from "../entities/review-run.entity";
import {
  type IRepoStatsOverview,
  ReviewService,
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
