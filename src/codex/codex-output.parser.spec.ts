import { parseCodexUsageJsonl } from "./codex-output.parser";

describe("parseCodexUsageJsonl", () => {
  it("should extract token usage from turn.completed event", () => {
    const jsonl = [
      "WARNING: noisy line",
      JSON.stringify({ type: "thread.started", thread_id: "abc" }),
      JSON.stringify({
        type: "turn.completed",
        usage: {
          input_tokens: 1200,
          cached_input_tokens: 300,
          output_tokens: 80,
        },
      }),
    ].join("\n");

    expect(parseCodexUsageJsonl(jsonl)).toEqual({
      inputTokens: 1200,
      cachedInputTokens: 300,
      outputTokens: 80,
    });
  });

  it("should ignore invalid json lines and return null fields when usage is missing", () => {
    const jsonl = [
      "not-json",
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({ type: "item.completed", item: { text: "OK" } }),
    ].join("\n");

    expect(parseCodexUsageJsonl(jsonl)).toEqual({
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
    });
  });

  it("should accept partial usage payloads", () => {
    const jsonl = JSON.stringify({
      type: "turn.completed",
      usage: {
        input_tokens: 700,
        output_tokens: 42,
      },
    });

    expect(parseCodexUsageJsonl(jsonl)).toEqual({
      inputTokens: 700,
      cachedInputTokens: null,
      outputTokens: 42,
    });
  });
});
