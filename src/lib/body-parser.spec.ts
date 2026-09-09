import { Controller, HttpCode, HttpStatus, Module, Post, UseGuards } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { createHmac } from "crypto";
import { configureBodyParser } from "./body-parser";
import { WebhookGuard } from "../webhook/webhook.guard";
import { RuntimeSettingsService } from "../settings/runtime-settings.service";

const mockError = jest.fn();

jest.mock("./logger", () => ({
  ServiceLogger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    error: mockError,
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  })),
}));

const SECRET = "test-webhook-secret";
const REPO_SLUG = "todoone_mt02_shell";

@Controller("webhooks")
class TestWebhookController {
  @Post("bitbucket")
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(WebhookGuard)
  handle(): { accepted: boolean } {
    return { accepted: true };
  }
}

@Module({
  controllers: [TestWebhookController],
  providers: [
    {
      provide: RuntimeSettingsService,
      useValue: {
        resolveWebhookSecret: () => Promise.resolve(SECRET),
      },
    },
  ],
})
class TestModule {}

/** Bitbucket-shaped payload padded to roughly `bytes` via the PR description. */
function buildPayload(bytes: number): string {
  const skeleton = {
    repository: {
      full_name: `workspace/${REPO_SLUG}`,
      workspace: { slug: "workspace" },
    },
    pullrequest: { id: 8, description: "" },
  };
  const padding = bytes - Buffer.byteLength(JSON.stringify(skeleton));
  skeleton.pullrequest.description = "d".repeat(Math.max(1, padding));
  return JSON.stringify(skeleton);
}

function sign(body: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
}

describe("configureBodyParser", () => {
  let app: NestExpressApplication;
  let url: string;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(TestModule, {
      rawBody: true,
      logger: false,
    });
    // Lower than production's 5mb so the oversize case stays cheap to send.
    configureBodyParser(app, "200kb");
    await app.listen(0);
    url = `${await app.getUrl()}/webhooks/bitbucket`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockError.mockClear();
  });

  function post(body: string, signature?: string): Promise<Response> {
    return fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-event-key": "pullrequest:comment_created",
        "x-hook-uuid": "hook-uuid-1234",
        "x-request-uuid": "request-uuid-5678",
        ...(signature ? { "x-hub-signature": signature } : {}),
      },
      body,
    });
  }

  it("accepts a payload above body-parser's 100KiB default with a valid signature", async () => {
    const body = buildPayload(150 * 1024);
    expect(Buffer.byteLength(body)).toBeGreaterThan(102_400);

    const response = await post(body, sign(body));

    // 202 proves both that the default limit is gone and that `rawBody` is
    // still populated — the guard computes its HMAC over it and fails closed.
    expect(response.status).toBe(HttpStatus.ACCEPTED);
    expect(await response.json()).toEqual({ accepted: true });
  });

  it("still rejects an oversized-but-signed payload with a bad signature", async () => {
    const body = buildPayload(150 * 1024);

    const response = await post(body, "sha256=deadbeef");

    expect(response.status).toBe(HttpStatus.FORBIDDEN);
  });

  it("falls back to \"unknown\" for headers a non-Bitbucket caller omits", async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: buildPayload(250 * 1024),
    });

    expect(response.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(mockError.mock.calls[0][0]).toContain(
      "x-event-key=unknown x-hook-uuid=unknown x-request-uuid=unknown",
    );
  });

  it("rejects a payload above the configured limit with 413", async () => {
    const response = await post(buildPayload(250 * 1024));

    expect(response.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
  });

  it("logs the Bitbucket attribution headers when a 413 is raised", async () => {
    const body = buildPayload(250 * 1024);

    await post(body, sign(body));

    expect(mockError).toHaveBeenCalledTimes(1);
    const message = mockError.mock.calls[0][0] as string;
    expect(message).toContain("limit 200kb");
    expect(message).toContain(`content-length=${Buffer.byteLength(body)}`);
    expect(message).toContain("x-event-key=pullrequest:comment_created");
    expect(message).toContain("x-hook-uuid=hook-uuid-1234");
    expect(message).toContain("x-request-uuid=request-uuid-5678");
  });
});
