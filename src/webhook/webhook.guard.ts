import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { ServiceLogger } from "@lib/logger";
import { createHmac, timingSafeEqual } from "crypto";
import { RuntimeSettingsService } from "../settings/runtime-settings.service";

@Injectable()
export class WebhookGuard implements CanActivate {
  private readonly logger = new ServiceLogger(WebhookGuard.name);

  constructor(private readonly runtimeSettings: RuntimeSettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

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
    const secret = await this.runtimeSettings.resolveWebhookSecret({
      workspaceSlug,
      repositorySlug: repoSlug,
    });

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
      const valid = timingSafeEqual(
        Buffer.from(signature, "utf8"),
        Buffer.from(expectedSignature, "utf8"),
      );
      if (valid) {
        request.verifiedRepoSlug = repoSlug;
        request.verifiedWorkspaceSlug = workspaceSlug;
      }
      return valid;
    } catch {
      this.logger.warn("Webhook signature verification failed");
      return false;
    }
  }
}
