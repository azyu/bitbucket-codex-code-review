import { QueryRunner } from "typeorm";
import { AddReviewRunUsageMetrics1744200000000 } from "./1744200000000-add-review-run-usage-metrics";

describe("AddReviewRunUsageMetrics1744200000000", () => {
  const queryRunner = {
    query: jest.fn(),
  } as unknown as QueryRunner;

  beforeEach(() => {
    jest.clearAllMocks();
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
