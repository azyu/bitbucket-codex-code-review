import * as Joi from "joi";
import { dbPoolValidationSchema } from "@lib/database";
import { DEFAULTS } from "./configuration";

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
  QUEUE_RETRY_ATTEMPTS: Joi.number().default(DEFAULTS.QUEUE_RETRY_ATTEMPTS),
  QUEUE_RETRY_DELAY: Joi.number().default(DEFAULTS.QUEUE_RETRY_DELAY),
  CODEX_BINARY_PATH: Joi.string().default(DEFAULTS.CODEX_BINARY_PATH),
  CODEX_TIMEOUT_MS: Joi.number().default(DEFAULTS.CODEX_TIMEOUT_MS),
  CODEX_MODEL: Joi.string().default(DEFAULTS.CODEX_MODEL),
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
  WORKSPACE_BASE_PATH: Joi.string().default(DEFAULTS.WORKSPACE_BASE_PATH),
  WORKSPACE_MAX_CONCURRENT: Joi.number().default(DEFAULTS.WORKSPACE_MAX_CONCURRENT),
  // execFile은 음수·소수 timeout에 ERR_OUT_OF_RANGE를 던진다 — 부팅 시 걸러낸다.
  // 0(타임아웃 없음)도 허용하지 않는다: 멈춘 clone이 워커 슬롯을 영구 점유한다.
  GIT_CLONE_TIMEOUT_MS: Joi.number()
    .integer()
    .positive()
    .default(DEFAULTS.GIT_CLONE_TIMEOUT_MS),
  REVIEW_TRIGGER_MODE: Joi.string()
    .valid("mention", "auto", "both")
    .default(DEFAULTS.TRIGGER_MODE),
  LOG_LEVEL: Joi.string()
    .valid("error", "warn", "info", "debug")
    .default(DEFAULTS.LOG_LEVEL),
});
