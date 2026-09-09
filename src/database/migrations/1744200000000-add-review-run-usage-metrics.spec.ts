import { QueryRunner } from "typeorm";
import { AddReviewRunUsageMetrics1744200000000 } from "./1744200000000-add-review-run-usage-metrics";

describe("AddReviewRunUsageMetrics1744200000000", () => {
  const queryRunner = {
    query: jest.fn(),
    hasColumn: jest.fn().mockResolvedValue(false),
  } as unknown as QueryRunner;

  beforeEach(() => {
    jest.clearAllMocks();
    (queryRunner.hasColumn as jest.Mock).mockResolvedValue(false);
  });

  it("adds usage metric columns", async () => {
    const migration = new AddReviewRunUsageMetrics1744200000000();

    await migration.up(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("ADD COLUMN totalDurationMs int NULL"),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("ADD COLUMN outputTokens int NULL"),
    );
  });

  it("skips columns already created by schema sync", async () => {
    (queryRunner.hasColumn as jest.Mock).mockResolvedValue(true);

    await new AddReviewRunUsageMetrics1744200000000().up(queryRunner);

    expect(queryRunner.query).not.toHaveBeenCalled();
  });

  it("drops usage metric columns in reverse order", async () => {
    const migration = new AddReviewRunUsageMetrics1744200000000();

    await migration.down(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("DROP COLUMN outputTokens"),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("DROP COLUMN totalDurationMs"),
    );
  });
});
