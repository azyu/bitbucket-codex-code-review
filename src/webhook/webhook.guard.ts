import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { ServiceLogger } from "@lib/logger";
import { createHmac, timingSafeEqual } from "crypto";
import { performance } from "perf_hooks";
import { RuntimeSettingsService } from "../settings/runtime-settings.service";

const LOOKUP_LIMIT = 120;
const LOOKUP_WINDOW_MS = 60_000;
const SIGNATURE_PATTERN = /^(?:sha256=)?([0-9a-f]{64})$/;

@Injectable()
export class WebhookGuard implements CanActivate {
  private readonly logger = new ServiceLogger(WebhookGuard.name);
  // ponytail: one shared process budget is intentionally simple; move it to ingress or a distributed limiter for multi-process enforcement.
  private lookupWindowStartedAt: number | undefined;
  private lookupAttempts = 0;

  constructor(private readonly runtimeSettings: RuntimeSettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const rawSignature: unknown = request.headers?.["x-hub-signature"];
    const signatureMatch =
      typeof rawSignature === "string"
        ? SIGNATURE_PATTERN.exec(rawSignature)
        : null;

    if (!signatureMatch) {
      this.logger.warn("Missing or malformed x-hub-signature header");
      return false;
    }

    const rawBody: unknown = request.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      this.logger.error("Raw body not available — enable rawBody in NestFactory");
      return false;
    }

    const repository = request.body?.repository;
    const fullName: unknown = repository?.full_name;
    const parts = typeof fullName === "string" ? fullName.split("/") : [];
    const [workspaceSlug, repoSlug] = parts;
    if (
      parts.length !== 2 ||
      !workspaceSlug ||
      !repoSlug ||
      repository?.workspace?.slug !== workspaceSlug
    ) {
      this.logger.error("Repository identity invalid — rejecting request");
      return false;
    }

    this.consumeLookupAttempt(http.getResponse());
    const secret = await this.runtimeSettings.resolveWebhookSecret({
      workspaceSlug,
      repositorySlug: repoSlug,
    });

    if (!secret) {
      this.logger.error(
        `No webhook secret for repo "${repoSlug}" — rejecting request (fail-closed)`,
      );
      return false;
    }

    const expectedSignature = createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    const valid = timingSafeEqual(
      Buffer.from(signatureMatch[1], "utf8"),
      Buffer.from(expectedSignature, "utf8"),
    );
    if (valid) {
      request.verifiedRepoSlug = repoSlug;
      request.verifiedWorkspaceSlug = workspaceSlug;
    }
    return valid;
  }

  private consumeLookupAttempt(response: {
    setHeader(name: string, value: string): void;
  }): void {
    const now = performance.now();
    if (
      this.lookupWindowStartedAt === undefined ||
      now - this.lookupWindowStartedAt >= LOOKUP_WINDOW_MS
    ) {
      this.lookupWindowStartedAt = now;
      this.lookupAttempts = 0;
    }

    if (this.lookupAttempts >= LOOKUP_LIMIT) {
      const retryAfter = Math.ceil(
        (this.lookupWindowStartedAt + LOOKUP_WINDOW_MS - now) / 1000,
      );
      response.setHeader("Retry-After", String(retryAfter));
      throw new HttpException(
        "Too many webhook authentication attempts",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.lookupAttempts += 1;
  }
}
