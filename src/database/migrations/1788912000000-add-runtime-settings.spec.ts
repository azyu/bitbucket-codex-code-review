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
    expect(statements[0]).toContain("`values` json NOT NULL");
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

  it("rejects rollback because workspace-qualified keys are irreversible", async () => {
    await expect(
      new AddRuntimeSettings1788912000000().down(queryRunner),
    ).rejects.toThrow("is irreversible");
    expect(queryRunner.query).not.toHaveBeenCalled();
  });
});
