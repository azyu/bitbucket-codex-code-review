import { QueryRunner } from "typeorm";
import { AddReviewRunModelMetadata1788566400000 } from "./1788566400000-add-review-run-model-metadata";

describe("AddReviewRunModelMetadata1788566400000", () => {
  const queryRunner = {
    query: jest.fn(),
  } as unknown as QueryRunner;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("adds model attribution columns", async () => {
    const migration = new AddReviewRunModelMetadata1788566400000();

    await migration.up(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("ADD COLUMN codexModel varchar(64) NULL"),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "ADD COLUMN codexReasoningEffort varchar(16) NULL",
      ),
    );
  });

  it("drops model attribution columns in reverse order", async () => {
    const migration = new AddReviewRunModelMetadata1788566400000();

    await migration.down(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("DROP COLUMN codexReasoningEffort"),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("DROP COLUMN codexModel"),
    );
  });
});
