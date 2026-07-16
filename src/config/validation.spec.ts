import { validationSchema } from "./validation";

describe("validationSchema", () => {
  const validEnv = {
    NODE_ENV: "test",
    DB_HOST: "localhost",
    DB_USERNAME: "user",
    DB_PASSWORD: "pass",
    DB_NAME: "reviews",
    REDIS_QUEUE_HOST: "localhost",
    REDIS_QUEUE_PORT: 6379,
    REDIS_QUEUE_PASSWORD: "",
    REDIS_QUEUE_DB: 0,
  };

  it("accepts valid required env and applies defaults", () => {
    const { error, value } = validationSchema.validate(validEnv);

    expect(error).toBeUndefined();
    expect(value).toEqual(
      expect.objectContaining({
        PORT: 3000,
        CODEX_BINARY_PATH: "codex",
        CODEX_MODEL: "gpt-5.6-sol",
        CODEX_REASONING_EFFORT: "medium",
        BITBUCKET_REPO_TOKENS: "",
        REVIEW_TRIGGER_MODE: "mention",
      }),
    );
  });

  it("accepts repo token and webhook secret JSON objects", () => {
    const { error, value } = validationSchema.validate({
      ...validEnv,
      BITBUCKET_REPO_TOKENS: '{"repo-a":"token-a"}',
      BITBUCKET_REPO_WEBHOOK_SECRETS: '{"repo-a":"secret-a"}',
    });

    expect(error).toBeUndefined();
    expect(value.BITBUCKET_REPO_TOKENS).toBe('{"repo-a":"token-a"}');
    expect(value.BITBUCKET_REPO_WEBHOOK_SECRETS).toBe(
      '{"repo-a":"secret-a"}',
    );
  });

  it("rejects repo token JSON arrays", () => {
    const { error } = validationSchema.validate({
      ...validEnv,
      BITBUCKET_REPO_TOKENS: '["token-a"]',
    });

    expect(error?.message).toContain("Invalid BITBUCKET_REPO_TOKENS");
    expect(error?.message).toContain("must be a JSON object");
  });

  it("rejects invalid repo webhook secret JSON", () => {
    const { error } = validationSchema.validate({
      ...validEnv,
      BITBUCKET_REPO_WEBHOOK_SECRETS: "{invalid}",
    });

    expect(error?.message).toContain(
      "Invalid BITBUCKET_REPO_WEBHOOK_SECRETS",
    );
  });

  it("accepts repo custom prompt filepath JSON objects", () => {
    const { error, value } = validationSchema.validate({
      ...validEnv,
      REVIEW_REPO_CUSTOM_PROMPT_FILEPATHS: '{"repo-a":"/prompts/a.md"}',
    });

    expect(error).toBeUndefined();
    expect(value.REVIEW_REPO_CUSTOM_PROMPT_FILEPATHS).toBe(
      '{"repo-a":"/prompts/a.md"}',
    );
  });

  it("rejects invalid repo custom prompt filepath JSON", () => {
    const { error } = validationSchema.validate({
      ...validEnv,
      REVIEW_REPO_CUSTOM_PROMPT_FILEPATHS: "{invalid}",
    });

    expect(error?.message).toContain(
      "Invalid REVIEW_REPO_CUSTOM_PROMPT_FILEPATHS",
    );
  });

  it("rejects unsupported trigger modes", () => {
    const { error } = validationSchema.validate({
      ...validEnv,
      REVIEW_TRIGGER_MODE: "manual",
    });

    expect(error?.message).toContain("REVIEW_TRIGGER_MODE");
  });

  it("rejects unsupported Codex reasoning effort", () => {
    const { error } = validationSchema.validate(
      {
        ...validEnv,
        CODEX_REASONING_EFFORT: "ultra",
      },
      { allowUnknown: true },
    );

    expect(error?.message).toContain("CODEX_REASONING_EFFORT");
  });

  it.each(["none", "low", "medium", "high", "xhigh", "max"])(
    "accepts Codex reasoning effort %s",
    (reasoningEffort) => {
      const { error, value } = validationSchema.validate({
        ...validEnv,
        CODEX_REASONING_EFFORT: reasoningEffort,
      });

      expect(error).toBeUndefined();
      expect(value.CODEX_REASONING_EFFORT).toBe(reasoningEffort);
    },
  );

  it("requires NODE_ENV", () => {
    const { NODE_ENV: _nodeEnv, ...envWithoutNodeEnv } = validEnv;

    const { error } = validationSchema.validate(envWithoutNodeEnv);

    expect(error?.message).toBe("NODE_ENV must be set");
  });
});
