import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReviewRunModelMetadata1788566400000
  implements MigrationInterface
{
  name = "AddReviewRunModelMetadata1788566400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE review_runs
        ADD COLUMN codexModel varchar(64) NULL,
        ADD COLUMN codexReasoningEffort varchar(16) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE review_runs
        DROP COLUMN codexReasoningEffort,
        DROP COLUMN codexModel
    `);
  }
}
