import {
  GLOBAL_SECRET_KEYS,
  GLOBAL_VALUE_KEYS,
  MAX_CUSTOM_PROMPT_CHARS,
  MAX_MODEL_CHARS,
  MAX_OPENAI_BASE_URL_BYTES,
  MAX_QUEUE_RETRY_ATTEMPTS,
  MAX_TIMER_MS,
  MAX_WORKER_CONCURRENCY,
  MODEL_PATTERN,
  REASONING_EFFORT_VALUES,
  REPOSITORY_SECRET_KEYS,
  REPOSITORY_VALUE_KEYS,
  TRIGGER_MODE_VALUES,
} from "../../../src/config/limits";

export {
  GLOBAL_SECRET_KEYS,
  GLOBAL_VALUE_KEYS,
  REPOSITORY_SECRET_KEYS,
  REPOSITORY_VALUE_KEYS,
};

/**
 * One description per settings field, with every bound derived from
 * `src/config/limits.ts` rather than typed in again. The server validates the
 * same numbers, so a form that accepts more than the API does is impossible
 * without editing the shared module.
 */
export type FieldSpec =
  | { kind: "integer"; label: string; hint?: string; min: number; max: number }
  | { kind: "select"; label: string; hint?: string; options: readonly string[] }
  | {
      kind: "text" | "url" | "textarea";
      label: string;
      hint?: string;
      maxLength: number;
      pattern?: string;
    };

export const FIELD_SPECS: Record<string, FieldSpec> = {
  model: {
    kind: "text",
    label: "Codex model",
    maxLength: MAX_MODEL_CHARS,
    pattern: MODEL_PATTERN.source,
  },
  reasoningEffort: {
    kind: "select",
    label: "Reasoning effort",
    hint: "empty = unset",
    options: REASONING_EFFORT_VALUES,
  },
  timeoutMs: {
    kind: "integer",
    label: "Codex timeout",
    hint: "ms",
    min: 1,
    max: MAX_TIMER_MS,
  },
  customPrompt: {
    kind: "textarea",
    label: "Custom review prompt",
    maxLength: MAX_CUSTOM_PROMPT_CHARS,
  },
  openaiBaseUrl: {
    kind: "url",
    label: "OpenAI base URL",
    hint: "HTTPS only; empty = default",
    maxLength: MAX_OPENAI_BASE_URL_BYTES,
  },
  triggerMode: {
    kind: "select",
    label: "Trigger mode",
    options: TRIGGER_MODE_VALUES,
  },
  retryAttempts: {
    kind: "integer",
    label: "Retry attempts",
    min: 1,
    max: MAX_QUEUE_RETRY_ATTEMPTS,
  },
  retryDelay: {
    kind: "integer",
    label: "Retry delay",
    hint: "ms; 0 allowed",
    min: 0,
    max: MAX_TIMER_MS,
  },
  workerConcurrency: {
    kind: "integer",
    label: "Worker concurrency",
    min: 1,
    max: MAX_WORKER_CONCURRENCY,
  },
  cloneTimeoutMs: {
    kind: "integer",
    label: "Git clone timeout",
    hint: "ms",
    min: 1,
    max: MAX_TIMER_MS,
  },
};

export const SECRET_LABELS: Record<string, string> = {
  openaiApiKey: "OpenAI API key",
  bitbucketApiToken: "Bitbucket API token",
  webhookSecret: "Webhook secret",
};

export function fieldSpec(key: string): FieldSpec {
  const spec = FIELD_SPECS[key];
  if (spec === undefined) throw new Error(`No field spec for ${key}`);
  return spec;
}

/** Form inputs are strings; integer fields must reach the API as integers. */
export function coerceValue(key: string, raw: string): unknown {
  if (fieldSpec(key).kind !== "integer") return raw;
  // An emptied number input reaches here as "". Number("") is 0, which
  // retryDelay's minimum of 0 would silently store; the other integer fields
  // have a minimum of 1 and would be rejected. Send "" so the server's integer
  // check rejects every empty integer field the same way.
  return raw === "" ? "" : Number(raw);
}

export function valueToInput(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}
