import {
  parseCodexUsageLine,
  parseCodexUsageJsonl,
} from "./codex-output.parser";

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

  it("should use last turn.completed when multiple exist", () => {
    const jsonl = [
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 100, output_tokens: 10 },
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 999, output_tokens: 88 },
      }),
    ].join("\n");

    expect(parseCodexUsageJsonl(jsonl)).toEqual({
      inputTokens: 999,
      cachedInputTokens: null,
      outputTokens: 88,
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

describe("parseCodexUsageLine", () => {
  it("should return metrics for a valid turn.completed line", () => {
    const line = JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: 500, cached_input_tokens: 100, output_tokens: 60 },
    });

    expect(parseCodexUsageLine(line)).toEqual({
      inputTokens: 500,
      cachedInputTokens: 100,
      outputTokens: 60,
    });
  });

  it("should return null for non-turn.completed event", () => {
    const line = JSON.stringify({ type: "thread.started", thread_id: "abc" });
    expect(parseCodexUsageLine(line)).toBeNull();
  });

  it("should return null for invalid JSON", () => {
    expect(parseCodexUsageLine("not-json")).toBeNull();
  });

  it("should return null for empty/whitespace line", () => {
    expect(parseCodexUsageLine("")).toBeNull();
    expect(parseCodexUsageLine("   ")).toBeNull();
  });

  it("should return null for turn.completed without usage", () => {
    const line = JSON.stringify({ type: "turn.completed" });
    expect(parseCodexUsageLine(line)).toBeNull();
  });

  it("should handle partial usage payload", () => {
    const line = JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: 300 },
    });

    expect(parseCodexUsageLine(line)).toEqual({
      inputTokens: 300,
      cachedInputTokens: null,
      outputTokens: null,
    });
  });
});
