import { DataSource } from "typeorm";
import dataSource from "./data-source";
import { prepareDatabase } from "./prepare";

function createSource(hasReviewRuns: boolean) {
  const queryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockImplementation((sql: string) =>
      Promise.resolve(sql.includes("GET_LOCK") ? [{ acquired: 1 }] : []),
    ),
    hasTable: jest.fn().mockResolvedValue(hasReviewRuns),
    release: jest.fn().mockResolvedValue(undefined),
  };
  const source = {
    initialize: jest.fn().mockResolvedValue(undefined),
    createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    synchronize: jest.fn().mockResolvedValue(undefined),
    runMigrations: jest.fn().mockResolvedValue([]),
    destroy: jest.fn().mockResolvedValue(undefined),
  };
  return { source: source as unknown as DataSource, mocks: source, queryRunner };
}

describe("prepareDatabase", () => {
  it("leaves migration transactions to migrations that need atomicity", () => {
    expect(dataSource.options.migrationsTransactionMode).toBe("none");
  });

  it("initializes a clean database before running migrations", async () => {
    const { source, mocks, queryRunner } = createSource(false);

    await prepareDatabase(source);

    expect(queryRunner.release).toHaveBeenCalled();
    expect(queryRunner.connect).toHaveBeenCalled();
    expect(queryRunner.query).toHaveBeenCalledWith(
      "SELECT GET_LOCK(?, 600) AS acquired",
      ["bb-codex-review:database-prepare"],
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      "SELECT RELEASE_LOCK(?)",
      ["bb-codex-review:database-prepare"],
    );
    expect(mocks.synchronize).toHaveBeenCalled();
    expect(mocks.synchronize.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.runMigrations.mock.invocationCallOrder[0],
    );
    expect(mocks.destroy).toHaveBeenCalled();
  });

  it("runs migrations without synchronizing an existing database", async () => {
    const { source, mocks } = createSource(true);

    await prepareDatabase(source);

    expect(mocks.synchronize).not.toHaveBeenCalled();
    expect(mocks.runMigrations).toHaveBeenCalled();
    expect(mocks.destroy).toHaveBeenCalled();
  });

  it("fails closed when it cannot acquire the migration lock", async () => {
    const { source, mocks, queryRunner } = createSource(true);
    queryRunner.query.mockResolvedValueOnce([{ acquired: 0 }]);

    await expect(prepareDatabase(source)).rejects.toThrow(
      "Timed out waiting for database preparation lock",
    );

    expect(mocks.runMigrations).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
    expect(mocks.destroy).toHaveBeenCalled();
  });
});
