import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReviewRunInput1790294400000 implements MigrationInterface {
  name = "AddReviewRunInput1790294400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns = [
      // 프롬프트는 최대 90만 자다 — TEXT(64KB)면 strict sql_mode에서 update가 실패한다.
      ["reviewPrompt", "mediumtext NULL"],
      ["codexCliVersion", "varchar(64) NULL"],
      ["reviewMergeBase", "varchar(40) NULL"],
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
        DROP COLUMN reviewMergeBase,
        DROP COLUMN codexCliVersion,
        DROP COLUMN reviewPrompt
    `);
  }
}
