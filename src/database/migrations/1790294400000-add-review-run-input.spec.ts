import { QueryRunner } from "typeorm";
import { AddReviewRunInput1790294400000 } from "./1790294400000-add-review-run-input";

describe("AddReviewRunInput1790294400000", () => {
  const queryRunner = {
    query: jest.fn(),
    hasColumn: jest.fn().mockResolvedValue(false),
  } as unknown as QueryRunner;

  beforeEach(() => {
    jest.clearAllMocks();
    (queryRunner.hasColumn as jest.Mock).mockResolvedValue(false);
  });

  it("adds review input columns, with the prompt wider than TEXT", async () => {
    await new AddReviewRunInput1790294400000().up(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("ADD COLUMN reviewPrompt mediumtext NULL"),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("ADD COLUMN codexCliVersion varchar(64) NULL"),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("ADD COLUMN reviewMergeBase varchar(40) NULL"),
    );
  });

  it("skips columns already created by schema sync", async () => {
    (queryRunner.hasColumn as jest.Mock).mockResolvedValue(true);

    await new AddReviewRunInput1790294400000().up(queryRunner);

    expect(queryRunner.query).not.toHaveBeenCalled();
  });

  it("drops review input columns", async () => {
    await new AddReviewRunInput1790294400000().down(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("DROP COLUMN reviewPrompt"),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("DROP COLUMN codexCliVersion"),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("DROP COLUMN reviewMergeBase"),
    );
  });
});
