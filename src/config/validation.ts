import * as Joi from "joi";
import { dbPoolValidationSchema } from "@lib/database";
import {
  DEFAULTS,
  MAX_QUEUE_RETRY_ATTEMPTS,
  MAX_TIMER_MS,
  MAX_WORKER_CONCURRENCY,
} from "./configuration";

function jsonObjectValidator(label: string) {
  return (value: string) => {
    if (!value) return value;
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("must be a JSON object");
      }
      return value;
    } catch (e) {
      throw new Error(`Invalid ${label}: ${(e as Error).message}`);
    }
  };
}

function exactUtf8Bytes(bytes: number, label: string) {
  return (value: string) => {
    if (Buffer.byteLength(value, "utf8") !== bytes) {
      throw new Error(`${label} must be exactly ${bytes} bytes`);
    }
    return value;
  };
}

function minimumUtf8Bytes(bytes: number, label: string) {
  return (value: string) => {
    if (Buffer.byteLength(value, "utf8") < bytes) {
      throw new Error(`${label} must be at least ${bytes} bytes`);
    }
    return value;
  };
}

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "production", "test", "staging", "local")
    .required()
    .error(new Error("NODE_ENV must be set")),
  PORT: Joi.number().default(DEFAULTS.PORT),
  METRICS_PORT: Joi.number().default(DEFAULTS.METRICS_PORT),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(DEFAULTS.DB_PORT),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  ...dbPoolValidationSchema,
  REDIS_QUEUE_HOST: Joi.string().required(),
  REDIS_QUEUE_PORT: Joi.number().required(),
  REDIS_QUEUE_USERNAME: Joi.string().allow("").default(""),
  REDIS_QUEUE_PASSWORD: Joi.string().allow("").required(),
  REDIS_QUEUE_DB: Joi.number().required(),
  // BullMQ attempts/backoff로 그대로 들어간다 (queue.module.ts).
  // attempts 0·음수는 재시도를 없애고, delay 음수는 계산된 백오프가 -1이 되어
  // BullMQ가 "재시도 안 함" 신호로 읽는다 — 둘 다 조용히 실패하므로 부팅에서 막는다.
  QUEUE_RETRY_ATTEMPTS: Joi.number()
    .integer()
    .positive()
    .max(MAX_QUEUE_RETRY_ATTEMPTS)
    .default(DEFAULTS.QUEUE_RETRY_ATTEMPTS),
  QUEUE_RETRY_DELAY: Joi.number()
    .integer()
    .min(0)
    .max(MAX_TIMER_MS)
    .default(DEFAULTS.QUEUE_RETRY_DELAY),
  CODEX_BINARY_PATH: Joi.string().default(DEFAULTS.CODEX_BINARY_PATH),
  CODEX_TIMEOUT_MS: Joi.number()
    .integer()
    .positive()
    .max(MAX_TIMER_MS)
    .default(DEFAULTS.CODEX_TIMEOUT_MS),
  CODEX_MODEL: Joi.string()
    .max(64)
    .pattern(/^[A-Za-z0-9][\w.-]*$/)
    .default(DEFAULTS.CODEX_MODEL),
  CODEX_REASONING_EFFORT: Joi.string()
    .valid("none", "low", "medium", "high", "xhigh", "max")
    .default(DEFAULTS.CODEX_REASONING_EFFORT),
  REVIEW_REPO_CUSTOM_PROMPT_FILEPATHS: Joi.string()
    .allow("")
    .default("")
    .custom(jsonObjectValidator("REVIEW_REPO_CUSTOM_PROMPT_FILEPATHS")),
  BITBUCKET_BASE_URL: Joi.string().default(DEFAULTS.BITBUCKET_BASE_URL),
  BITBUCKET_API_TOKEN: Joi.string().allow("").default(""),
  BITBUCKET_REPO_TOKENS: Joi.string()
    .allow("")
    .default("")
    .custom(jsonObjectValidator("BITBUCKET_REPO_TOKENS")),
  BITBUCKET_USERNAME: Joi.string().allow("").default(""),
  BITBUCKET_APP_PASSWORD: Joi.string().allow("").default(""),
  BITBUCKET_WEBHOOK_SECRET: Joi.string().allow("").default(""),
  BITBUCKET_REPO_WEBHOOK_SECRETS: Joi.string()
    .allow("")
    .default("")
    .custom(jsonObjectValidator("BITBUCKET_REPO_WEBHOOK_SECRETS")),
  OPENAI_API_KEY: Joi.string().allow("").default(""),
  OPENAI_BASE_URL: Joi.string().uri({ scheme: ["https"] }).allow("").default(""),
  DASHBOARD_SECRET_KEY: Joi.string()
    .required()
    .custom(minimumUtf8Bytes(32, "DASHBOARD_SECRET_KEY")),
  SETTINGS_ENCRYPTION_KEY: Joi.string()
    .required()
    .custom(exactUtf8Bytes(32, "SETTINGS_ENCRYPTION_KEY")),
  RUNTIME_SETTINGS_REPOSITORY_WORKSPACE_MAP: Joi.string()
    .allow("")
    .default("")
    .custom(jsonObjectValidator("RUNTIME_SETTINGS_REPOSITORY_WORKSPACE_MAP")),
  WORKSPACE_BASE_PATH: Joi.string().default(DEFAULTS.WORKSPACE_BASE_PATH),
  // 워커 concurrency로 그대로 들어간다 — BullMQ 세터가 1 미만/비정수를 거부한다.
  WORKSPACE_MAX_CONCURRENT: Joi.number()
    .integer()
    .min(1)
    .max(MAX_WORKER_CONCURRENCY)
    .default(DEFAULTS.WORKSPACE_MAX_CONCURRENT),
  // 0(타임아웃 없음)도 허용하지 않는다: 멈춘 clone이 워커 슬롯을 영구 점유한다.
  // 2^31-1 초과는 Node 타이머가 ~1ms로 접어 타임아웃이 되레 짧아진다.
  GIT_CLONE_TIMEOUT_MS: Joi.number()
    .integer()
    .positive()
    .max(MAX_TIMER_MS)
    .default(DEFAULTS.GIT_CLONE_TIMEOUT_MS),
  REVIEW_TRIGGER_MODE: Joi.string()
    .valid("mention", "auto", "both")
    .default(DEFAULTS.TRIGGER_MODE),
  LOG_LEVEL: Joi.string()
    .valid("error", "warn", "info", "debug")
    .default(DEFAULTS.LOG_LEVEL),
});
