import {
  ExecutionContext,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { createHmac } from "crypto";
import { performance } from "perf_hooks";
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

function repositoryPayload(repositorySlug: string, workspaceSlug = "ws") {
  return {
    full_name: `${workspaceSlug}/${repositorySlug}`,
    workspace: { slug: workspaceSlug },
  };
}

function buildExecutionContext(overrides: {
  headers?: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
  body?: Record<string, unknown>;
}) {
  const request = {
    headers: overrides.headers ?? {},
    rawBody: overrides.rawBody,
    body:
      overrides.body ??
      { repository: repositoryPayload("repository", "workspace") },
  };
  const setHeader = jest.fn();
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { context, request, setHeader };
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

describe("WebhookGuard", () => {
  const SECRET = "test-webhook-secret";
  const WELL_FORMED_SIGNATURE = "a".repeat(64);

  it.each<
    [
      string,
      Record<string, string | string[] | undefined>,
      Buffer | undefined,
    ]
  >([
    ["a missing signature", {}, Buffer.from("body")],
    [
      "an array signature",
      { "x-hub-signature": [WELL_FORMED_SIGNATURE] },
      Buffer.from("body"),
    ],
    [
      "a malformed signature",
      { "x-hub-signature": "sha256=abc" },
      Buffer.from("body"),
    ],
    [
      "an absent raw body",
      { "x-hub-signature": WELL_FORMED_SIGNATURE },
      undefined,
    ],
  ])("rejects %s without looking up a secret", async (_name, headers, rawBody) => {
    const settings = buildSettingsMock({ webhookSecret: SECRET });
    const guard = new WebhookGuard(settings as never);
    const { context } = buildExecutionContext({ headers, rawBody });

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(settings.resolveWebhookSecret).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "accepts a matching lowercase HMAC (prefix: %s)",
    async (prefixed) => {
      const rawBody = Buffer.from('{"action":"pr:comment:added"}', "utf8");
      const hex = createHmac("sha256", SECRET).update(rawBody).digest("hex");
      const settings = buildSettingsMock({ webhookSecret: SECRET });
      const guard = new WebhookGuard(settings as never);
      const { context, request } = buildExecutionContext({
        headers: {
          "x-hub-signature": prefixed ? `sha256=${hex}` : hex,
        },
        rawBody,
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request).toMatchObject({
        verifiedRepoSlug: "repository",
        verifiedWorkspaceSlug: "workspace",
      });
    },
  );

  it("rejects a well-formed HMAC that does not match", async () => {
    const rawBody = Buffer.from("real-body", "utf8");
    const wrongSignature = createHmac("sha256", SECRET)
      .update("different-body")
      .digest("hex");
    const guard = new WebhookGuard(
      buildSettingsMock({ webhookSecret: SECRET }) as never,
    );
    const { context } = buildExecutionContext({
      headers: { "x-hub-signature": `sha256=${wrongSignature}` },
      rawBody,
    });

    await expect(guard.canActivate(context)).resolves.toBe(false);
  });

  it("fails closed when no repository or global secret exists", async () => {
    const settings = buildSettingsMock({});
    const guard = new WebhookGuard(settings as never);
    const { context } = buildExecutionContext({
      headers: { "x-hub-signature": WELL_FORMED_SIGNATURE },
      rawBody: Buffer.from("body"),
    });

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(settings.resolveWebhookSecret).toHaveBeenCalledTimes(1);
  });

  it("uses the repository-specific secret and passes its workspace identity", async () => {
    const rawBody = Buffer.from("body", "utf8");
    const repositorySecret = "repository-secret";
    const hex = createHmac("sha256", repositorySecret)
      .update(rawBody)
      .digest("hex");
    const settings = buildSettingsMock({
      repoWebhookSecrets: { repository: repositorySecret },
    });
    const guard = new WebhookGuard(settings as never);
    const { context } = buildExecutionContext({
      headers: { "x-hub-signature": `sha256=${hex}` },
      rawBody,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(settings.resolveWebhookSecret).toHaveBeenCalledWith({
      workspaceSlug: "workspace",
      repositorySlug: "repository",
    });
  });

  it("rejects disagreement between full_name and workspace without a lookup", async () => {
    const repository = {
      ...repositoryPayload("repository", "workspace"),
      workspace: { slug: "other-workspace" },
    };
    const rawBody = Buffer.from(JSON.stringify({ repository }), "utf8");
    const signature = createHmac("sha256", SECRET)
      .update(rawBody)
      .digest("hex");
    const settings = buildSettingsMock({ webhookSecret: SECRET });
    const guard = new WebhookGuard(settings as never);
    const { context } = buildExecutionContext({
      headers: { "x-hub-signature": `sha256=${signature}` },
      rawBody,
      body: { repository },
    });

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(settings.resolveWebhookSecret).not.toHaveBeenCalled();
  });

  describe("lookup admission", () => {
    let now: number;

    beforeEach(() => {
      now = 0;
      jest.spyOn(performance, "now").mockImplementation(() => now);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    function attackContext() {
      return buildExecutionContext({
        headers: { "x-hub-signature": WELL_FORMED_SIGNATURE },
        rawBody: Buffer.from("body"),
      });
    }

    it("rejects the 121st lookup before the database with the remaining retry delay", async () => {
      const settings = buildSettingsMock({ webhookSecret: SECRET });
      const guard = new WebhookGuard(settings as never);

      for (let attempt = 0; attempt < 120; attempt += 1) {
        await guard.canActivate(attackContext().context);
      }

      now = 1_001;
      const limited = attackContext();
      await expect(guard.canActivate(limited.context)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
      expect(settings.resolveWebhookSecret).toHaveBeenCalledTimes(120);
      expect(limited.setHeader).toHaveBeenCalledWith("Retry-After", "59");
    });

    it("starts a fresh admission window after 60 seconds", async () => {
      const settings = buildSettingsMock({ webhookSecret: SECRET });
      const guard = new WebhookGuard(settings as never);

      for (let attempt = 0; attempt < 120; attempt += 1) {
        await guard.canActivate(attackContext().context);
      }

      now = 60_000;
      await expect(guard.canActivate(attackContext().context)).resolves.toBe(
        false,
      );
      expect(settings.resolveWebhookSecret).toHaveBeenCalledTimes(121);
    });

    it("bounds concurrent lookup attempts before awaiting the database", async () => {
      let releaseLookup: (secret: string) => void = () => undefined;
      const pendingLookup = new Promise<string>((resolve) => {
        releaseLookup = resolve;
      });
      const settings = {
        resolveWebhookSecret: jest.fn(() => pendingLookup),
      };
      const guard = new WebhookGuard(settings as never);
      const contexts = Array.from({ length: 121 }, () => attackContext());
      const attempts = contexts.map(({ context }) => guard.canActivate(context));

      expect(settings.resolveWebhookSecret).toHaveBeenCalledTimes(120);
      expect(contexts[120].setHeader).toHaveBeenCalledWith(
        "Retry-After",
        "60",
      );

      releaseLookup(SECRET);
      const results = await Promise.allSettled(attempts);
      expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
        120,
      );
      expect(results[120]).toMatchObject({
        status: "rejected",
        reason: expect.any(HttpException),
      });
    });
  });
});
