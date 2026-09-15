/**
 * Validation limits and enumerations shared by the backend validators and the
 * dashboard UI.
 *
 * This module must stay dependency-free: the dashboard bundle imports it
 * directly so that the input bounds it renders cannot drift from the bounds
 * `RuntimeSettingsService.validateValue` enforces. Adding an import of `@lib`,
 * TypeORM or Nest here would drag the server into the browser bundle.
 */

export const MAX_QUEUE_RETRY_ATTEMPTS = 10;
export const MAX_WORKER_CONCURRENCY = 32;
export const MAX_TIMER_MS = 2_147_483_647;
export const MAX_OPENAI_BASE_URL_BYTES = 2_048;
export const MAX_CUSTOM_PROMPT_CHARS = 100_000;
export const MAX_MODEL_CHARS = 64;

/** `""` means "unset" and is accepted by validateValue; it is not an inherit. */
export const REASONING_EFFORT_VALUES = [
  "",
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export const TRIGGER_MODE_VALUES = ["mention", "auto", "both"] as const;

export const MODEL_PATTERN = /^[A-Za-z0-9][\w.-]*$/;

/**
 * Settings key whitelists. `RuntimeSettingsService.validatePatch` rejects
 * anything outside them, and the dashboard renders exactly these fields — a
 * form offering a key the server would 400 on is the drift this prevents.
 */
export const GLOBAL_VALUE_KEYS = [
  "model",
  "reasoningEffort",
  "timeoutMs",
  "customPrompt",
  "openaiBaseUrl",
  "triggerMode",
  "retryAttempts",
  "retryDelay",
  "workerConcurrency",
  "cloneTimeoutMs",
] as const;

export const REPOSITORY_VALUE_KEYS = [
  "model",
  "reasoningEffort",
  "timeoutMs",
  "customPrompt",
] as const;

export const GLOBAL_SECRET_KEYS = [
  "openaiApiKey",
  "bitbucketApiToken",
  "webhookSecret",
] as const;

export const REPOSITORY_SECRET_KEYS = [
  "bitbucketApiToken",
  "webhookSecret",
] as const;

export type GlobalValueKey = (typeof GLOBAL_VALUE_KEYS)[number];
export type RepositoryValueKey = (typeof REPOSITORY_VALUE_KEYS)[number];
