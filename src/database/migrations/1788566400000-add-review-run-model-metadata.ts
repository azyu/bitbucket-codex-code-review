import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReviewRunModelMetadata1788566400000
  implements MigrationInterface
{
  name = "AddReviewRunModelMetadata1788566400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns = [
      ["codexModel", "varchar(64) NULL"],
      ["codexReasoningEffort", "varchar(16) NULL"],
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
        DROP COLUMN codexReasoningEffort,
        DROP COLUMN codexModel
    `);
  }
}
