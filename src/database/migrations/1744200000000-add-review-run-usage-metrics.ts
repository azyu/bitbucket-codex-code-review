import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReviewRunUsageMetrics1744200000000
  implements MigrationInterface
{
  name = "AddReviewRunUsageMetrics1744200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE review_runs
        ADD COLUMN totalDurationMs int NULL,
        ADD COLUMN inputTokens int NULL,
        ADD COLUMN cachedInputTokens int NULL,
        ADD COLUMN outputTokens int NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE review_runs
        DROP COLUMN outputTokens,
        DROP COLUMN cachedInputTokens,
        DROP COLUMN inputTokens,
        DROP COLUMN totalDurationMs
    `);
  }
}
