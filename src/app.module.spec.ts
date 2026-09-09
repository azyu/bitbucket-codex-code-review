describe("AppModule", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      DB_HOST: "localhost",
      DB_USERNAME: "user",
      DB_PASSWORD: "pass",
      DB_NAME: "reviews",
      REDIS_QUEUE_HOST: "localhost",
      REDIS_QUEUE_PORT: "6379",
      REDIS_QUEUE_PASSWORD: "",
      REDIS_QUEUE_DB: "0",
      DASHBOARD_SECRET_KEY: "dashboard-secret-key-at-least-32!",
      SETTINGS_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads the root Nest module wiring", async () => {
    await expect(import("./app.module")).resolves.toHaveProperty("AppModule");
  });
});
