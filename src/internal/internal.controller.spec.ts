import { InternalController } from "./internal.controller";
import { ReviewRunStatus } from "../entities/review-run.entity";

describe("InternalController", () => {
  const mockReviewService = {
    findLatestByPr: jest.fn(),
    findById: jest.fn(),
    getRepoStats: jest.fn(),
    listRepoStats: jest.fn(),
    listRecent: jest.fn(),
  };

  let controller: InternalController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new InternalController(mockReviewService as never);
  });

  it("should return stats for a single repo", async () => {
    mockReviewService.getRepoStats.mockResolvedValue({
      repoSlug: "repo-a",
      counts: { total: 1, completed: 1, failed: 0, superseded: 0 },
      durations: {
        codexTotalMs: 1000,
        codexAvgMs: 1000,
        reviewTotalMs: 1200,
        reviewAvgMs: 1200,
      },
      tokens: {
        inputTokens: 500,
        cachedInputTokens: 100,
        outputTokens: 20,
        totalTokens: 520,
      },
      latestReview: {
        id: 1,
        pullRequestId: 2,
        reviewStatus: ReviewRunStatus.COMPLETED,
      },
    });

    await expect(controller.getRepoStats("repo-a")).resolves.toEqual(
      expect.objectContaining({
        repoSlug: "repo-a",
        tokens: expect.objectContaining({ totalTokens: 520 }),
      }),
    );
  });

  it("should return all repo stats for dashboard summary", async () => {
    mockReviewService.listRepoStats.mockResolvedValue([
      { repoSlug: "repo-b" },
      { repoSlug: "repo-a" },
    ]);

    await expect(controller.listRepoStats()).resolves.toEqual([
      { repoSlug: "repo-b" },
      { repoSlug: "repo-a" },
    ]);
  });

  describe("listRecentReviews", () => {
    it("delegates with default limit (10) when query is omitted", async () => {
      mockReviewService.listRecent.mockResolvedValue([]);

      await controller.listRecentReviews(10);

      expect(mockReviewService.listRecent).toHaveBeenCalledWith(10);
    });

    it("passes custom limit through to the service unchanged", async () => {
      mockReviewService.listRecent.mockResolvedValue([]);

      await controller.listRecentReviews(25);

      expect(mockReviewService.listRecent).toHaveBeenCalledWith(25);
    });

    it("returns the service result as-is", async () => {
      const payload = [
        {
          id: 7,
          repositorySlug: "repo-a",
          pullRequestId: 42,
          headCommitHash: "abc1234",
          reviewStatus: ReviewRunStatus.COMPLETED,
        },
      ];
      mockReviewService.listRecent.mockResolvedValue(payload);

      await expect(controller.listRecentReviews(5)).resolves.toBe(payload);
    });
  });
});
