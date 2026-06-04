import { createDbPoolConfig, CustomNamingStrategy } from "./database";

describe("database helpers", () => {
  it("creates mysql pool config from pool sizing inputs", () => {
    expect(createDbPoolConfig(10, 4)).toEqual({
      connectionLimit: 10,
      maxIdle: 4,
      waitForConnections: true,
      queueLimit: 0,
      idleTimeout: 3600000,
      connectTimeout: 10000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30000,
    });
  });

  it("converts entity class names to snake_case table names", () => {
    const strategy = new CustomNamingStrategy();

    expect(strategy.tableName("ReviewRunEntity", "")).toBe("review_run");
    expect(strategy.tableName("IgnoredClassName", "CustomReviewRuns")).toBe(
      "custom_review_runs",
    );
  });
});
