import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ServiceLogger } from "@lib/logger";
import { createHmac, timingSafeEqual } from "crypto";

@Injectable()
export class WebhookGuard implements CanActivate {
  private readonly logger = new ServiceLogger(WebhookGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Extract repo slug from parsed body for per-repo secret lookup
    const repoSlug: string | undefined = request.body?.repository?.slug;

    const repoSecrets =
      this.configService.get<Record<string, string>>(
        "bitbucket.repoWebhookSecrets",
      ) ?? {};
    const globalSecret = this.configService.get<string>(
      "bitbucket.webhookSecret",
      "",
    );
    const secret = (repoSlug && repoSecrets[repoSlug]) || globalSecret;

    if (!secret) {
      this.logger.error(
        `No webhook secret for repo "${repoSlug ?? "unknown"}" — rejecting request (fail-closed)`,
      );
      return false;
    }
    const rawSignature = request.headers["x-hub-signature"] as string | undefined;
    if (!rawSignature) {
      this.logger.warn("Missing x-hub-signature header");
      return false;
    }

    const rawBody: Buffer | undefined = request.rawBody;
    if (!rawBody) {
      this.logger.error("Raw body not available — enable rawBody in NestFactory");
      return false;
    }

    // Bitbucket sends "sha256=<hex>", strip the prefix
    const signature = rawSignature.startsWith("sha256=")
      ? rawSignature.slice(7)
      : rawSignature;

    const expectedSignature = createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    try {
      return timingSafeEqual(
        Buffer.from(signature, "utf8"),
        Buffer.from(expectedSignature, "utf8"),
      );
    } catch {
      this.logger.warn("Webhook signature verification failed");
      return false;
    }
  }
}
