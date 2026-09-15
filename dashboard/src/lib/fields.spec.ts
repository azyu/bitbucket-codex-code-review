import { describe, expect, it } from "vitest";
import { coerceValue, valueToInput } from "./fields";

describe("coerceValue", () => {
  it("sends an integer for a filled number field", () => {
    expect(coerceValue("retryDelay", "2500")).toBe(2500);
    expect(coerceValue("workerConcurrency", "3")).toBe(3);
  });

  it("does not turn an emptied number field into 0", () => {
    // Number("") is 0 and retryDelay's server-side minimum is 0, so coercing
    // here would silently store a 0ms delay for a field the user cleared.
    // Every other integer field has a minimum of 1 and would be rejected, so
    // the empty value has to reach the server as a non-integer for all of them.
    expect(coerceValue("retryDelay", "")).toBe("");
    expect(coerceValue("timeoutMs", "")).toBe("");
  });

  it("passes non-integer fields through unchanged", () => {
    expect(coerceValue("model", "gpt-5.6-sol")).toBe("gpt-5.6-sol");
    expect(coerceValue("customPrompt", "")).toBe("");
  });
});

describe("valueToInput", () => {
  it("renders a stored empty string as an empty input, not as inherited", () => {
    expect(valueToInput("")).toBe("");
    expect(valueToInput(0)).toBe("0");
    expect(valueToInput(null)).toBe("");
  });
});
