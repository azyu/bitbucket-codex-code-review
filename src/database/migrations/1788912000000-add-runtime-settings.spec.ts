import { QueryRunner } from "typeorm";
import { AddRuntimeSettings1788912000000 } from "./1788912000000-add-runtime-settings";

describe("AddRuntimeSettings1788912000000", () => {
  const queryRunner = {
    query: jest.fn(),
    hasTable: jest.fn().mockResolvedValue(false),
    hasColumn: jest.fn().mockResolvedValue(false),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
  } as unknown as QueryRunner;

  beforeEach(() => {
    jest.clearAllMocks();
    (queryRunner.hasTable as jest.Mock).mockResolvedValue(false);
    (queryRunner.hasColumn as jest.Mock).mockResolvedValue(false);
    (queryRunner.query as jest.Mock).mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes("INSERT IGNORE") ? { affectedRows: 1 } : undefined,
      ),
    );
  });

  it("creates encrypted settings storage before workspace-qualifying review keys", async () => {
    await new AddRuntimeSettings1788912000000().up(queryRunner);

    const statements = (queryRunner.query as jest.Mock).mock.calls.map(
      ([sql]: [string]) => sql,
    );
    expect(statements[0]).toContain("CREATE TABLE runtime_settings");
    expect(statements[0]).toContain("encryptedSecrets text NOT NULL");
    expect(statements[0]).toContain("`values` json NOT NULL");
    expect(statements[1]).toContain(
      "MODIFY COLUMN idempotencyKey varchar(600) NOT NULL",
    );
    expect(statements[2]).toContain(
      "ADD COLUMN settingsSnapshot json NULL",
    );
    expect(statements[3]).toContain(
      "CREATE TABLE IF NOT EXISTS schema_migration_markers",
    );
    expect(statements[4]).toContain(
      "INSERT IGNORE INTO schema_migration_markers",
    );
    expect(statements[5]).toContain(
      "SET idempotencyKey = CONCAT(workspaceSlug, ':', idempotencyKey)",
    );
    expect(statements[5]).toContain("WHERE workspaceSlug <> ''");
    expect(queryRunner.startTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it("runs only the data migration when schema sync created current tables", async () => {
    (queryRunner.hasTable as jest.Mock).mockResolvedValue(true);
    (queryRunner.hasColumn as jest.Mock).mockResolvedValue(true);

    await new AddRuntimeSettings1788912000000().up(queryRunner);

    const statements = (queryRunner.query as jest.Mock).mock.calls.map(
      ([sql]: [string]) => sql,
    );
    expect(statements).toHaveLength(4);
    expect(statements[0]).toContain(
      "MODIFY COLUMN idempotencyKey varchar(600) NOT NULL",
    );
    expect(statements[1]).toContain(
      "CREATE TABLE IF NOT EXISTS schema_migration_markers",
    );
    expect(statements[2]).toContain(
      "INSERT IGNORE INTO schema_migration_markers",
    );
    expect(statements[3]).toContain(
      "SET idempotencyKey = CONCAT(workspaceSlug, ':', idempotencyKey)",
    );
  });

  it("does not rewrite keys after another runner committed the marker", async () => {
    (queryRunner.hasTable as jest.Mock).mockResolvedValue(true);
    (queryRunner.hasColumn as jest.Mock).mockResolvedValue(true);
    (queryRunner.query as jest.Mock).mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes("INSERT IGNORE") ? { affectedRows: 0 } : undefined,
      ),
    );

    await new AddRuntimeSettings1788912000000().up(queryRunner);

    const statements = (queryRunner.query as jest.Mock).mock.calls.map(
      ([sql]: [string]) => sql,
    );
    expect(statements).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("UPDATE review_runs"),
      ]),
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });

  it("rolls back the marker when the key rewrite fails", async () => {
    (queryRunner.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes("INSERT IGNORE")) {
        return Promise.resolve({ affectedRows: 1 });
      }
      if (sql.includes("UPDATE review_runs")) {
        return Promise.reject(new Error("update failed"));
      }
      return Promise.resolve(undefined);
    });

    await expect(
      new AddRuntimeSettings1788912000000().up(queryRunner),
    ).rejects.toThrow("update failed");
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });

  it("rejects rollback because workspace-qualified keys are irreversible", async () => {
    await expect(
      new AddRuntimeSettings1788912000000().down(queryRunner),
    ).rejects.toThrow("is irreversible");
    expect(queryRunner.query).not.toHaveBeenCalled();
  });
});
