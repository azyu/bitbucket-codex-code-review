import { ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "crypto";
import { WebhookGuard } from "./webhook.guard";

jest.mock("@lib/logger", () => ({
  ServiceLogger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  })),
}));

function buildExecutionContext(overrides: {
  headers?: Record<string, string>;
  rawBody?: Buffer;
  body?: Record<string, unknown>;
}): ExecutionContext {
  const request = {
    headers: overrides.headers ?? {},
    rawBody: overrides.rawBody,
    body: overrides.body,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

/** Helper: build a config mock that responds to per-repo secret keys */
function buildConfigMock(overrides: {
  repoWebhookSecrets?: Record<string, string>;
  webhookSecret?: string;
}): ConfigService {
  const defaults: Record<string, unknown> = {
    "bitbucket.repoWebhookSecrets": overrides.repoWebhookSecrets ?? {},
    "bitbucket.webhookSecret": overrides.webhookSecret ?? "",
  };
  return {
    get: jest.fn((key: string, defaultValue?: unknown) =>
      key in defaults ? defaults[key] : defaultValue,
    ),
  } as unknown as ConfigService;
}

describe("WebhookGuard", () => {
  const SECRET = "test-webhook-secret";

  describe("global secret (backward compat)", () => {
    let guard: WebhookGuard;

    beforeEach(() => {
      guard = new WebhookGuard(buildConfigMock({ webhookSecret: SECRET }));
    });

    it("should return false when x-hub-signature header is missing", () => {
      const ctx = buildExecutionContext({
        headers: {},
        rawBody: Buffer.from("body"),
      });
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it("should return false when rawBody is not available", () => {
      const ctx = buildExecutionContext({
        headers: { "x-hub-signature": "some-sig" },
        rawBody: undefined,
      });
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it("should return true when signature matches (with sha256= prefix)", () => {
      const body = '{"action":"pr:comment:added"}';
      const rawBody = Buffer.from(body, "utf8");
      const hex = createHmac("sha256", SECRET).update(rawBody).digest("hex");

      const ctx = buildExecutionContext({
        headers: { "x-hub-signature": `sha256=${hex}` },
        rawBody,
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it("should return true when signature matches (without prefix)", () => {
      const body = '{"action":"pr:comment:added"}';
      const rawBody = Buffer.from(body, "utf8");
      const hex = createHmac("sha256", SECRET).update(rawBody).digest("hex");

      const ctx = buildExecutionContext({
        headers: { "x-hub-signature": hex },
        rawBody,
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it("should return false when signature does NOT match", () => {
      const rawBody = Buffer.from("real-body", "utf8");
      const wrongSig = createHmac("sha256", SECRET)
        .update("different-body")
        .digest("hex");

      const ctx = buildExecutionContext({
        headers: { "x-hub-signature": `sha256=${wrongSig}` },
        rawBody,
      });
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it("should return false when timingSafeEqual throws (length mismatch)", () => {
      const rawBody = Buffer.from("body", "utf8");
      const shortSig = "abc";

      const ctx = buildExecutionContext({
        headers: { "x-hub-signature": shortSig },
        rawBody,
      });
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it("should use global secret when body has no repository slug", () => {
      const body = '{"action":"test"}';
      const rawBody = Buffer.from(body, "utf8");
      const hex = createHmac("sha256", SECRET).update(rawBody).digest("hex");

      const ctx = buildExecutionContext({
        headers: { "x-hub-signature": `sha256=${hex}` },
        rawBody,
        body: { action: "test" },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe("no secret configured (fail-closed)", () => {
    it("should return false when no global or repo secret", () => {
      const guard = new WebhookGuard(buildConfigMock({}));
      const ctx = buildExecutionContext({
        headers: { "x-hub-signature": "some-sig" },
        rawBody: Buffer.from("body"),
        body: { repository: { slug: "unknown-repo" } },
      });
      expect(guard.canActivate(ctx)).toBe(false);
    });
  });

  describe("per-repo webhook secrets", () => {
    const REPO_A_SECRET = "secret-for-repo-a";
    const REPO_B_SECRET = "secret-for-repo-b";
    let guard: WebhookGuard;

    beforeEach(() => {
      guard = new WebhookGuard(
        buildConfigMock({
          repoWebhookSecrets: {
            "repo-a": REPO_A_SECRET,
            "repo-b": REPO_B_SECRET,
          },
        }),
      );
    });

    it("should use repo-specific secret for repo-a", () => {
      const body = JSON.stringify({ repository: { slug: "repo-a" } });
      const rawBody = Buffer.from(body, "utf8");
      const hex = createHmac("sha256", REPO_A_SECRET)
        .update(rawBody)
        .digest("hex");

      const ctx = buildExecutionContext({
        headers: { "x-hub-signature": `sha256=${hex}` },
        rawBody,
        body: { repository: { slug: "repo-a" } },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it("should use repo-specific secret for repo-b", () => {
      const body = JSON.stringify({ repository: { slug: "repo-b" } });
      const rawBody = Buffer.from(body, "utf8");
      const hex = createHmac("sha256", REPO_B_SECRET)
        .update(rawBody)
        .digest("hex");

      const ctx = buildExecutionContext({
        headers: { "x-hub-signature": `sha256=${hex}` },
        rawBody,
        body: { repository: { slug: "repo-b" } },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it("should reject when signed with wrong repo secret", () => {
      const body = JSON.stringify({ repository: { slug: "repo-a" } });
      const rawBody = Buffer.from(body, "utf8");
      const hex = createHmac("sha256", REPO_B_SECRET)
        .update(rawBody)
        .digest("hex");

      const ctx = buildExecutionContext({
        headers: { "x-hub-signature": `sha256=${hex}` },
        rawBody,
        body: { repository: { slug: "repo-a" } },
      });
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it("should fall back to global secret when repo not in map", () => {
      const globalSecret = "global-fallback";
      const guardWithFallback = new WebhookGuard(
        buildConfigMock({
          repoWebhookSecrets: { "repo-a": REPO_A_SECRET },
          webhookSecret: globalSecret,
        }),
      );

      const body = JSON.stringify({ repository: { slug: "repo-c" } });
      const rawBody = Buffer.from(body, "utf8");
      const hex = createHmac("sha256", globalSecret)
        .update(rawBody)
        .digest("hex");

      const ctx = buildExecutionContext({
        headers: { "x-hub-signature": `sha256=${hex}` },
        rawBody,
        body: { repository: { slug: "repo-c" } },
      });
      expect(guardWithFallback.canActivate(ctx)).toBe(true);
    });

    it("should reject unknown repo when no global fallback", () => {
      const body = JSON.stringify({ repository: { slug: "unknown" } });
      const rawBody = Buffer.from(body, "utf8");

      const ctx = buildExecutionContext({
        headers: { "x-hub-signature": "sha256=abc" },
        rawBody,
        body: { repository: { slug: "unknown" } },
      });
      expect(guard.canActivate(ctx)).toBe(false);
    });
  });
});
