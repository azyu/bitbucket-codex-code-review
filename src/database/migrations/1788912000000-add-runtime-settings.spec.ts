import { QueryRunner } from "typeorm";
import { AddRuntimeSettings1788912000000 } from "./1788912000000-add-runtime-settings";

describe("AddRuntimeSettings1788912000000", () => {
  const queryRunner = { query: jest.fn() } as unknown as QueryRunner;

  beforeEach(() => jest.clearAllMocks());

  it("creates encrypted settings storage before workspace-qualifying review keys", async () => {
    await new AddRuntimeSettings1788912000000().up(queryRunner);

    const statements = (queryRunner.query as jest.Mock).mock.calls.map(
      ([sql]: [string]) => sql,
    );
    expect(statements[0]).toContain("CREATE TABLE runtime_settings");
    expect(statements[0]).toContain("encryptedSecrets text NOT NULL");
    expect(statements[1]).toContain(
      "MODIFY COLUMN idempotencyKey varchar(600) NOT NULL",
    );
    expect(statements[1]).toContain("ADD COLUMN settingsSnapshot json NULL");
    expect(statements[2]).toContain(
      "SET idempotencyKey = CONCAT(workspaceSlug, ':', idempotencyKey)",
    );
    expect(statements[2]).toContain("WHERE workspaceSlug <> ''");
    expect(statements[2]).not.toContain("idempotencyKey NOT LIKE");
  });

  it("removes the workspace prefix before restoring the legacy column width", async () => {
    await new AddRuntimeSettings1788912000000().down(queryRunner);

    const statements = (queryRunner.query as jest.Mock).mock.calls.map(
      ([sql]: [string]) => sql,
    );
    expect(statements[0]).toContain(
      "SUBSTRING(idempotencyKey, CHAR_LENGTH(workspaceSlug) + 2)",
    );
    expect(statements[1]).toContain(
      "MODIFY COLUMN idempotencyKey varchar(255) NOT NULL",
    );
    expect(statements[2]).toBe("DROP TABLE runtime_settings");
  });
});
