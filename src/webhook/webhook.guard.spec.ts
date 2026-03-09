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
}): ExecutionContext {
  const request = {
    headers: overrides.headers ?? {},
    rawBody: overrides.rawBody,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe("WebhookGuard", () => {
  const SECRET = "test-webhook-secret";
  let guard: WebhookGuard;
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      get: jest.fn(),
    } as unknown as ConfigService;
    guard = new WebhookGuard(configService);
  });

  it("should return false when secret is NOT configured (fail-closed)", () => {
    (configService.get as jest.Mock).mockReturnValue(undefined);

    const ctx = buildExecutionContext({
      headers: { "x-hub-signature": "some-sig" },
      rawBody: Buffer.from("body"),
    });

    expect(guard.canActivate(ctx)).toBe(false);
  });

  it("should return false when x-hub-signature header is missing", () => {
    (configService.get as jest.Mock).mockReturnValue(SECRET);

    const ctx = buildExecutionContext({
      headers: {},
      rawBody: Buffer.from("body"),
    });

    expect(guard.canActivate(ctx)).toBe(false);
  });

  it("should return false when rawBody is not available", () => {
    (configService.get as jest.Mock).mockReturnValue(SECRET);

    const ctx = buildExecutionContext({
      headers: { "x-hub-signature": "some-sig" },
      rawBody: undefined,
    });

    expect(guard.canActivate(ctx)).toBe(false);
  });

  it("should return true when signature matches (with sha256= prefix)", () => {
    (configService.get as jest.Mock).mockReturnValue(SECRET);

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
    (configService.get as jest.Mock).mockReturnValue(SECRET);

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
    (configService.get as jest.Mock).mockReturnValue(SECRET);

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
    (configService.get as jest.Mock).mockReturnValue(SECRET);

    const rawBody = Buffer.from("body", "utf8");
    // A signature with different length than expected hex digest will cause
    // timingSafeEqual to throw because Buffer lengths differ
    const shortSig = "abc";

    const ctx = buildExecutionContext({
      headers: { "x-hub-signature": shortSig },
      rawBody,
    });

    expect(guard.canActivate(ctx)).toBe(false);
  });
});
