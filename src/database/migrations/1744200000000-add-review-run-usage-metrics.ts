import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReviewRunUsageMetrics1744200000000
  implements MigrationInterface
{
  name = "AddReviewRunUsageMetrics1744200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE review_runs
        ADD COLUMN total_duration_ms int NULL,
        ADD COLUMN input_tokens int NULL,
        ADD COLUMN cached_input_tokens int NULL,
        ADD COLUMN output_tokens int NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE review_runs
        DROP COLUMN output_tokens,
        DROP COLUMN cached_input_tokens,
        DROP COLUMN input_tokens,
        DROP COLUMN total_duration_ms
    `);
  }
}
