import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReviewRunUsageMetrics1744200000000
  implements MigrationInterface
{
  name = "AddReviewRunUsageMetrics1744200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns = [
      ["totalDurationMs", "int NULL"],
      ["inputTokens", "int NULL"],
      ["cachedInputTokens", "int NULL"],
      ["outputTokens", "int NULL"],
    ] as const;
    for (const [name, definition] of columns) {
      if (!(await queryRunner.hasColumn("review_runs", name))) {
        await queryRunner.query(
          `ALTER TABLE review_runs ADD COLUMN ${name} ${definition}`,
        );
      }
    }
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
