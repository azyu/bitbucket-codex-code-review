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
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads the root Nest module wiring", async () => {
    await expect(import("./app.module")).resolves.toHaveProperty("AppModule");
  });
});
