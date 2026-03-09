import { SCHEMA_NAME_CODE_REVIEW } from "@lib/index";

/** 기본값 상수 — 모든 fallback은 여기서 관리 */
export const DEFAULTS = {
  PORT: 3000,
  METRICS_PORT: 9463,
  DB_PORT: 3309,
  DB_POOL_SIZE: 5,
  DB_POOL_MAX_IDLE: 2,
  REDIS_PORT: 6379,
  REDIS_DB: 0,
  QUEUE_RETRY_ATTEMPTS: 3,
  QUEUE_RETRY_DELAY: 5000,
  CODEX_BINARY_PATH: "codex",
  CODEX_TIMEOUT_MS: 600_000,
  CODEX_MODEL: "gpt-5.4",
  CODEX_REASONING_EFFORT: "high",
  BITBUCKET_BASE_URL: "https://api.bitbucket.org/2.0",
  WORKSPACE_BASE_PATH: "/tmp/code-review-workspaces",
  WORKSPACE_MAX_CONCURRENT: 3,
  TRIGGER_MODE: "mention",
  LOG_LEVEL: "info",
} as const;

export default (): Record<string, unknown> => ({
  port: parseInt(process.env["PORT"] || String(DEFAULTS.PORT), 10),
  metricsPort: parseInt(process.env["METRICS_PORT"] || String(DEFAULTS.METRICS_PORT), 10),
  database: {
    host: process.env["DB_HOST"] || "localhost",
    port: parseInt(process.env["DB_PORT"] || String(DEFAULTS.DB_PORT), 10),
    username: process.env["DB_USERNAME"] || "root",
    password: process.env["DB_PASSWORD"] || "",
    database: process.env["DB_NAME"] || SCHEMA_NAME_CODE_REVIEW,
    synchronize: process.env["DB_SYNCHRONIZE"] === "true",
    logging: process.env["DB_LOGGING"] === "true",
    poolSize: parseInt(process.env["DB_POOL_SIZE"] || String(DEFAULTS.DB_POOL_SIZE), 10),
    maxIdle: parseInt(process.env["DB_POOL_MAX_IDLE"] || String(DEFAULTS.DB_POOL_MAX_IDLE), 10),
  },
  redis: {
    queue: {
      host: process.env["REDIS_QUEUE_HOST"],
      port: parseInt(process.env["REDIS_QUEUE_PORT"] || String(DEFAULTS.REDIS_PORT), 10),
      username: process.env["REDIS_QUEUE_USERNAME"] || "",
      password: process.env["REDIS_QUEUE_PASSWORD"] || "",
      db: parseInt(process.env["REDIS_QUEUE_DB"] || String(DEFAULTS.REDIS_DB), 10),
    },
  },
  queue: {
    retryAttempts: parseInt(process.env["QUEUE_RETRY_ATTEMPTS"] || String(DEFAULTS.QUEUE_RETRY_ATTEMPTS), 10),
    retryDelay: parseInt(process.env["QUEUE_RETRY_DELAY"] || String(DEFAULTS.QUEUE_RETRY_DELAY), 10),
  },
  codex: {
    binaryPath: process.env["CODEX_BINARY_PATH"] || DEFAULTS.CODEX_BINARY_PATH,
    timeoutMs: parseInt(process.env["CODEX_TIMEOUT_MS"] || String(DEFAULTS.CODEX_TIMEOUT_MS), 10),
    model: process.env["CODEX_MODEL"] || DEFAULTS.CODEX_MODEL,
    reasoningEffort: process.env["CODEX_REASONING_EFFORT"] || DEFAULTS.CODEX_REASONING_EFFORT,
  },
  bitbucket: {
    baseUrl: process.env["BITBUCKET_BASE_URL"] || DEFAULTS.BITBUCKET_BASE_URL,
    apiToken: process.env["BITBUCKET_API_TOKEN"] || "",
    username: process.env["BITBUCKET_USERNAME"] || "",
    appPassword: process.env["BITBUCKET_APP_PASSWORD"] || "",
    webhookSecret: process.env["BITBUCKET_WEBHOOK_SECRET"] || "",
  },
  workspace: {
    basePath: process.env["WORKSPACE_BASE_PATH"] || DEFAULTS.WORKSPACE_BASE_PATH,
    maxConcurrent: parseInt(process.env["WORKSPACE_MAX_CONCURRENT"] || String(DEFAULTS.WORKSPACE_MAX_CONCURRENT), 10),
  },
  trigger: {
    mode: process.env["REVIEW_TRIGGER_MODE"] || DEFAULTS.TRIGGER_MODE,
  },
  logLevel: process.env["LOG_LEVEL"] || DEFAULTS.LOG_LEVEL,
});
