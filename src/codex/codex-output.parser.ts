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

export function parseCodexUsageJsonl(jsonl: string): ICodexUsageMetrics {
  const lines = jsonl
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];

    try {
      const parsed = JSON.parse(line) as ICodexUsageEvent;
      if (parsed.type !== "turn.completed" || !parsed.usage) {
        continue;
      }

      return {
        inputTokens: toNullableNumber(parsed.usage.input_tokens),
        cachedInputTokens: toNullableNumber(parsed.usage.cached_input_tokens),
        outputTokens: toNullableNumber(parsed.usage.output_tokens),
      };
    } catch {
      continue;
    }
  }

  return {
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
  };
}
