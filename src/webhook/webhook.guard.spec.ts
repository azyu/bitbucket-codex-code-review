import { ExecutionContext } from "@nestjs/common";
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
    body:
      overrides.body ?? { repository: repositoryPayload("repository", "workspace") },
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function buildSettingsMock(overrides: {
  repoWebhookSecrets?: Record<string, string>;
  webhookSecret?: string;
}) {
  return {
    resolveWebhookSecret: jest.fn(
      ({
        repositorySlug,
      }: {
        workspaceSlug: string;
        repositorySlug: string;
      }) =>
        Promise.resolve(
          overrides.repoWebhookSecrets?.[repositorySlug] ??
            overrides.webhookSecret ??
            "",
        ),
    ),
  };
}

function repositoryPayload(repositorySlug: string, workspaceSlug = "ws") {
  return {
    full_name: `${workspaceSlug}/${repositorySlug}`,
    workspace: { slug: workspaceSlug },
  };
}

describe("WebhookGuard", () => {
  const SECRET = "test-webhook-secret";

  describe("global secret (backward compat)", () => {
    let guard: WebhookGuard;

    beforeEach(() => {
      guard = new WebhookGuard(buildSettingsMock({ webhookSecret: SECRET }) as never);
    });

    it("should return false when x-hub-signature header is missing", async () => { const ctx = buildExecutionContext({
      headers: {},
      rawBody: Buffer.from("body"),
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(false); });

    it("should return false when rawBody is not available", async () => { const ctx = buildExecutionContext({
      headers: { "x-hub-signature": "some-sig" },
      rawBody: undefined,
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(false); });

    it("should return true when signature matches (with sha256= prefix)", async () => { const body = '{"action":"pr:comment:added"}';
    const rawBody = Buffer.from(body, "utf8");
    const hex = createHmac("sha256", SECRET).update(rawBody).digest("hex");
    
    const ctx = buildExecutionContext({
      headers: { "x-hub-signature": `sha256=${hex}` },
      rawBody,
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true); });

    it("should return true when signature matches (without prefix)", async () => { const body = '{"action":"pr:comment:added"}';
    const rawBody = Buffer.from(body, "utf8");
    const hex = createHmac("sha256", SECRET).update(rawBody).digest("hex");
    
    const ctx = buildExecutionContext({
      headers: { "x-hub-signature": hex },
      rawBody,
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true); });

    it("should return false when signature does NOT match", async () => { const rawBody = Buffer.from("real-body", "utf8");
    const wrongSig = createHmac("sha256", SECRET)
      .update("different-body")
      .digest("hex");
    
    const ctx = buildExecutionContext({
      headers: { "x-hub-signature": `sha256=${wrongSig}` },
      rawBody,
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(false); });

    it("should return false when timingSafeEqual throws (length mismatch)", async () => { const rawBody = Buffer.from("body", "utf8");
    const shortSig = "abc";
    
    const ctx = buildExecutionContext({
      headers: { "x-hub-signature": shortSig },
      rawBody,
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(false); });

    it("should reject a payload without a workspace-qualified identity", async () => {
      const body = '{"action":"test"}';
      const rawBody = Buffer.from(body, "utf8");
      const hex = createHmac("sha256", SECRET).update(rawBody).digest("hex");
      const ctx = buildExecutionContext({
        headers: { "x-hub-signature": `sha256=${hex}` },
        rawBody,
        body: { action: "test" },
      });

      await expect(guard.canActivate(ctx)).resolves.toBe(false);
    });
  });

  describe("no secret configured (fail-closed)", () => {
    it("should return false when no global or repo secret", async () => { const guard = new WebhookGuard(buildSettingsMock({}) as never);
    const ctx = buildExecutionContext({
      headers: { "x-hub-signature": "some-sig" },
      rawBody: Buffer.from("body"),
      body: { repository: repositoryPayload("unknown-repo") },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(false); });
  });

  describe("per-repo webhook secrets", () => {
    const REPO_A_SECRET = "secret-for-repo-a";
    const REPO_B_SECRET = "secret-for-repo-b";
    let guard: WebhookGuard;

    beforeEach(() => {
      guard = new WebhookGuard(
        buildSettingsMock({
          repoWebhookSecrets: {
            "repo-a": REPO_A_SECRET,
            "repo-b": REPO_B_SECRET,
          },
        }) as never,
      );
    });

    it("should use repo-specific secret for repo-a", async () => { const body = JSON.stringify({ repository: repositoryPayload("repo-a") });
    const rawBody = Buffer.from(body, "utf8");
    const hex = createHmac("sha256", REPO_A_SECRET)
      .update(rawBody)
      .digest("hex");
    
    const ctx = buildExecutionContext({
      headers: { "x-hub-signature": `sha256=${hex}` },
      rawBody,
      body: { repository: repositoryPayload("repo-a") },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true); });

    it("should use repo-specific secret for repo-b", async () => { const body = JSON.stringify({ repository: repositoryPayload("repo-b") });
    const rawBody = Buffer.from(body, "utf8");
    const hex = createHmac("sha256", REPO_B_SECRET)
      .update(rawBody)
      .digest("hex");
    
    const ctx = buildExecutionContext({
      headers: { "x-hub-signature": `sha256=${hex}` },
      rawBody,
      body: { repository: repositoryPayload("repo-b") },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true); });

    it("should reject when signed with wrong repo secret", async () => { const body = JSON.stringify({ repository: repositoryPayload("repo-a") });
    const rawBody = Buffer.from(body, "utf8");
    const hex = createHmac("sha256", REPO_B_SECRET)
      .update(rawBody)
      .digest("hex");
    
    const ctx = buildExecutionContext({
      headers: { "x-hub-signature": `sha256=${hex}` },
      rawBody,
      body: { repository: repositoryPayload("repo-a") },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(false); });

    it("should fall back to global secret when repo not in map", async () => { const globalSecret = "global-fallback";
    const guardWithFallback = new WebhookGuard(
      buildSettingsMock({
        repoWebhookSecrets: { "repo-a": REPO_A_SECRET },
        webhookSecret: globalSecret,
      }) as never,
    );
    
    const body = JSON.stringify({ repository: repositoryPayload("repo-c") });
    const rawBody = Buffer.from(body, "utf8");
    const hex = createHmac("sha256", globalSecret)
      .update(rawBody)
      .digest("hex");
    
    const ctx = buildExecutionContext({
      headers: { "x-hub-signature": `sha256=${hex}` },
      rawBody,
      body: { repository: repositoryPayload("repo-c") },
    });
    await expect(guardWithFallback.canActivate(ctx)).resolves.toBe(true); });

    it("should reject unknown repo when no global fallback", async () => { const body = JSON.stringify({ repository: repositoryPayload("unknown") });
    const rawBody = Buffer.from(body, "utf8");
    
    const ctx = buildExecutionContext({
      headers: { "x-hub-signature": "sha256=abc" },
      rawBody,
      body: { repository: repositoryPayload("unknown") },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(false); });

    it("rejects disagreement between full_name and repository identity fields", async () => {
      const repository = {
        ...repositoryPayload("repo-a"),
        workspace: { slug: "other-workspace" },
      };
      const rawBody = Buffer.from(JSON.stringify({ repository }), "utf8");
      const ctx = buildExecutionContext({
        headers: { "x-hub-signature": "sha256=unused" },
        rawBody,
        body: { repository },
      });

      await expect(guard.canActivate(ctx)).resolves.toBe(false);
    });
  });
});
