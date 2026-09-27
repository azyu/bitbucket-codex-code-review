import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReviewRunLastRepliedComment1790467200000
  implements MigrationInterface
{
  name = "AddReviewRunLastRepliedComment1790467200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn("review_runs", "lastRepliedCommentId"))) {
      await queryRunner.query(
        "ALTER TABLE review_runs ADD COLUMN lastRepliedCommentId bigint NULL",
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE review_runs DROP COLUMN lastRepliedCommentId",
    );
  }
}
