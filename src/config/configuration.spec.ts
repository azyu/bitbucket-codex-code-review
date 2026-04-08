import { parseRepoTokens } from "./configuration";

describe("parseRepoTokens", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns empty object for undefined", () => {
    expect(parseRepoTokens(undefined)).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseRepoTokens("")).toEqual({});
  });

  it("parses valid JSON object", () => {
    const input = '{"repo-a":"token-a","repo-b":"token-b"}';
    expect(parseRepoTokens(input)).toEqual({
      "repo-a": "token-a",
      "repo-b": "token-b",
    });
  });

  it("warns and returns empty object for invalid JSON", () => {
    expect(parseRepoTokens("{invalid}")).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to parse BITBUCKET_REPO_TOKENS"),
    );
  });

  it("warns and returns empty object for JSON array", () => {
    expect(parseRepoTokens('["a","b"]')).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("not a JSON object"),
    );
  });

  it("warns and returns empty object for JSON primitive", () => {
    expect(parseRepoTokens('"just-a-string"')).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("not a JSON object"),
    );
  });

  it("skips non-string values", () => {
    const input = '{"repo-a":"token-a","repo-b":123,"repo-c":null}';
    expect(parseRepoTokens(input)).toEqual({ "repo-a": "token-a" });
  });

  it("does not warn for valid input", () => {
    parseRepoTokens('{"repo":"token"}');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
