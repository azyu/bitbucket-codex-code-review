import * as Joi from "joi";
import { dbPoolValidationSchema } from "@lib/database";
import { DEFAULTS } from "./configuration";

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
  BITBUCKET_BASE_URL: Joi.string().default(DEFAULTS.BITBUCKET_BASE_URL),
  BITBUCKET_API_TOKEN: Joi.string().allow("").default(""),
  BITBUCKET_USERNAME: Joi.string().allow("").default(""),
  BITBUCKET_APP_PASSWORD: Joi.string().allow("").default(""),
  BITBUCKET_WEBHOOK_SECRET: Joi.string().allow("").default(""),
  WORKSPACE_BASE_PATH: Joi.string().default(DEFAULTS.WORKSPACE_BASE_PATH),
  WORKSPACE_MAX_CONCURRENT: Joi.number().default(DEFAULTS.WORKSPACE_MAX_CONCURRENT),
  REVIEW_TRIGGER_MODE: Joi.string()
    .valid("mention", "auto", "both")
    .default(DEFAULTS.TRIGGER_MODE),
  LOG_LEVEL: Joi.string()
    .valid("error", "warn", "info", "debug")
    .default(DEFAULTS.LOG_LEVEL),
});
