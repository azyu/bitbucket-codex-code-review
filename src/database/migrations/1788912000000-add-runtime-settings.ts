import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRuntimeSettings1788912000000 implements MigrationInterface {
  name = "AddRuntimeSettings1788912000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE runtime_settings (
        scopeKey varchar(600) NOT NULL,
        scope enum('global', 'repository') NOT NULL,
        workspaceSlug varchar(255) NOT NULL DEFAULT '',
        repositorySlug varchar(255) NOT NULL DEFAULT '',
        values json NOT NULL,
        encryptedSecrets text NOT NULL,
        revision int NOT NULL DEFAULT 1,
        updatedAt timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (scopeKey),
        UNIQUE KEY IDX_runtime_settings_scope_identity (scope, workspaceSlug, repositorySlug)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      ALTER TABLE review_runs
        MODIFY COLUMN idempotencyKey varchar(600) NOT NULL,
        ADD COLUMN settingsSnapshot json NULL
    `);
    await queryRunner.query(`
      UPDATE review_runs
      SET idempotencyKey = CONCAT(workspaceSlug, ':', idempotencyKey)
      WHERE workspaceSlug <> ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE review_runs
      SET idempotencyKey = SUBSTRING(idempotencyKey, CHAR_LENGTH(workspaceSlug) + 2)
      WHERE workspaceSlug <> ''
        AND idempotencyKey LIKE CONCAT(workspaceSlug, ':%')
    `);
    await queryRunner.query(`
      ALTER TABLE review_runs
        DROP COLUMN settingsSnapshot,
        MODIFY COLUMN idempotencyKey varchar(255) NOT NULL
    `);
    await queryRunner.query("DROP TABLE runtime_settings");
  }
}
