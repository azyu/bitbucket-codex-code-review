import { QueryRunner } from "typeorm";
import { AddReviewRunLastRepliedComment1790467200000 } from "./1790467200000-add-review-run-last-replied-comment";

describe("AddReviewRunLastRepliedComment1790467200000", () => {
  const queryRunner = {
    query: jest.fn(),
    hasColumn: jest.fn(),
  } as unknown as QueryRunner;

  beforeEach(() => {
    jest.clearAllMocks();
    (queryRunner.hasColumn as jest.Mock).mockResolvedValue(false);
  });

  it("adds the last replied comment column", async () => {
    await new AddReviewRunLastRepliedComment1790467200000().up(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      "ALTER TABLE review_runs ADD COLUMN lastRepliedCommentId bigint NULL",
    );
  });

  it("skips the column already created by schema sync", async () => {
    (queryRunner.hasColumn as jest.Mock).mockResolvedValue(true);

    await new AddReviewRunLastRepliedComment1790467200000().up(queryRunner);

    expect(queryRunner.query).not.toHaveBeenCalled();
  });

  it("drops the column", async () => {
    await new AddReviewRunLastRepliedComment1790467200000().down(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      "ALTER TABLE review_runs DROP COLUMN lastRepliedCommentId",
    );
  });
});
