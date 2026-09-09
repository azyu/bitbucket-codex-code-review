import { DataSource } from "typeorm";
import { prepareDatabase } from "./prepare";

function createSource(hasReviewRuns: boolean) {
  const queryRunner = {
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
  it("initializes a clean database before running migrations", async () => {
    const { source, mocks, queryRunner } = createSource(false);

    await prepareDatabase(source);

    expect(queryRunner.release).toHaveBeenCalled();
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
});
