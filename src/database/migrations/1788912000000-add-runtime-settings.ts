import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRuntimeSettings1788912000000 implements MigrationInterface {
  name = "AddRuntimeSettings1788912000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("runtime_settings"))) {
      await queryRunner.query(`
        CREATE TABLE runtime_settings (
          scopeKey varchar(600) NOT NULL,
          scope enum('global', 'repository') NOT NULL,
          workspaceSlug varchar(255) NOT NULL DEFAULT '',
          repositorySlug varchar(255) NOT NULL DEFAULT '',
          \`values\` json NOT NULL,
          encryptedSecrets text NOT NULL,
          revision int NOT NULL DEFAULT 1,
          updatedAt timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (scopeKey),
          UNIQUE KEY IDX_runtime_settings_scope_identity (scope, workspaceSlug, repositorySlug)
        ) ENGINE=InnoDB
      `);
    }
    await queryRunner.query(`
      ALTER TABLE review_runs
        MODIFY COLUMN idempotencyKey varchar(600) NOT NULL
    `);
    if (!(await queryRunner.hasColumn("review_runs", "settingsSnapshot"))) {
      await queryRunner.query(`
        ALTER TABLE review_runs ADD COLUMN settingsSnapshot json NULL
      `);
    }
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS schema_migration_markers (
        name varchar(255) NOT NULL,
        PRIMARY KEY (name)
      ) ENGINE=InnoDB
    `);
    await queryRunner.startTransaction();
    try {
      const marker = await queryRunner.query(`
        INSERT IGNORE INTO schema_migration_markers (name)
        VALUES ('workspace-qualified-idempotency-keys')
      `) as { affectedRows?: number };
      if (marker.affectedRows === 1) {
        await queryRunner.query(`
          UPDATE review_runs
          SET idempotencyKey = CONCAT(workspaceSlug, ':', idempotencyKey)
          WHERE workspaceSlug <> ''
        `);
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      "AddRuntimeSettings1788912000000 is irreversible: keep the migration applied when rolling back the application image",
    );
  }
}
