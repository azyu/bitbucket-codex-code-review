import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ServiceLogger } from "@lib/logger";
import { createHmac, timingSafeEqual } from "crypto";

@Injectable()
export class WebhookGuard implements CanActivate {
  private readonly logger = new ServiceLogger(WebhookGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.configService.get<string>("bitbucket.webhookSecret");
    if (!secret) {
      this.logger.error(
        "Webhook secret not configured — rejecting request (fail-closed)",
      );
      return false;
    }

    const request = context.switchToHttp().getRequest();
    const signature = request.headers["x-hub-signature"] as string | undefined;
    if (!signature) {
      this.logger.warn("Missing x-hub-signature header");
      return false;
    }

    const rawBody: Buffer | undefined = request.rawBody;
    if (!rawBody) {
      this.logger.error("Raw body not available — enable rawBody in NestFactory");
      return false;
    }

    const rawBodyStr = rawBody.toString("utf8");
    const expectedSignature = createHmac("sha256", secret)
      .update(rawBodyStr)
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
