import configuration, { parseJsonRecord } from "./configuration";

describe("configuration", () => {
  const originalCodexModel = process.env["CODEX_MODEL"];

  afterEach(() => {
    if (originalCodexModel === undefined) {
      delete process.env["CODEX_MODEL"];
    } else {
      process.env["CODEX_MODEL"] = originalCodexModel;
    }
  });

  it("defaults Codex to GPT-6 Astra", () => {
    delete process.env["CODEX_MODEL"];

    const config = configuration();

    expect(config).toEqual(
      expect.objectContaining({
        codex: expect.objectContaining({ model: "gpt-6-astra" }),
      }),
    );
  });
});

describe("parseJsonRecord", () => {
  let warnSpy: jest.SpyInstance;
  const ENV_NAME = "TEST_JSON_VAR";

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns empty object for undefined", () => {
    expect(parseJsonRecord(undefined, ENV_NAME)).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseJsonRecord("", ENV_NAME)).toEqual({});
  });

  it("parses valid JSON object", () => {
    const input = '{"repo-a":"token-a","repo-b":"token-b"}';
    expect(parseJsonRecord(input, ENV_NAME)).toEqual({
      "repo-a": "token-a",
      "repo-b": "token-b",
    });
  });

  it("warns and returns empty object for invalid JSON", () => {
    expect(parseJsonRecord("{invalid}", ENV_NAME)).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Failed to parse ${ENV_NAME}`),
    );
  });

  it("warns and returns empty object for JSON array", () => {
    expect(parseJsonRecord('["a","b"]', ENV_NAME)).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("not a JSON object"),
    );
  });

  it("warns and returns empty object for JSON primitive", () => {
    expect(parseJsonRecord('"just-a-string"', ENV_NAME)).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("not a JSON object"),
    );
  });

  it("skips non-string values", () => {
    const input = '{"repo-a":"token-a","repo-b":123,"repo-c":null}';
    expect(parseJsonRecord(input, ENV_NAME)).toEqual({ "repo-a": "token-a" });
  });

  it("does not warn for valid input", () => {
    parseJsonRecord('{"repo":"token"}', ENV_NAME);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
