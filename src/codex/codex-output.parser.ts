export interface ICodexUsageMetrics {
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
}

interface ICodexUsageEvent {
  readonly type?: unknown;
  readonly usage?: {
    readonly input_tokens?: unknown;
    readonly cached_input_tokens?: unknown;
    readonly output_tokens?: unknown;
  };
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseCodexErrorLine(line: string): string | null {
  try {
    const parsed = JSON.parse(line) as {
      readonly type?: unknown;
      readonly message?: unknown;
      readonly error?: { readonly message?: unknown };
    };
    const message =
      parsed.type === "error"
        ? parsed.message
        : parsed.type === "turn.failed"
          ? parsed.error?.message
          : null;
    return typeof message === "string" && message.trim() ? message.trim() : null;
  } catch {
    return null;
  }
}

const NULL_USAGE: ICodexUsageMetrics = {
  inputTokens: null,
  cachedInputTokens: null,
  outputTokens: null,
};

export function parseCodexUsageLine(line: string): ICodexUsageMetrics | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as ICodexUsageEvent;
    if (parsed.type !== "turn.completed" || !parsed.usage) {
      return null;
    }

    return {
      inputTokens: toNullableNumber(parsed.usage.input_tokens),
      cachedInputTokens: toNullableNumber(parsed.usage.cached_input_tokens),
      outputTokens: toNullableNumber(parsed.usage.output_tokens),
    };
  } catch {
    return null;
  }
}

export function parseCodexUsageJsonl(jsonl: string): ICodexUsageMetrics {
  const lines = jsonl.split("\n").filter((l) => l.trim());

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const result = parseCodexUsageLine(lines[index]);
    if (result) {
      return result;
    }
  }

  return NULL_USAGE;
}
