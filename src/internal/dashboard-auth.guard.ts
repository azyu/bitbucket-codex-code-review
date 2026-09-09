import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";

@Injectable()
export class DashboardAuthGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(configService: ConfigService) {
    this.expected = Buffer.from(
      configService.getOrThrow<string>("runtimeSettings.dashboardSecretKey"),
      "utf8",
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const response = context.switchToHttp().getResponse<{
      setHeader(name: string, value: string): void;
    }>();
    response.setHeader("Cache-Control", "no-store");
    const authorization = request.headers.authorization;
    const raw = Array.isArray(authorization) ? authorization[0] : authorization;
    const supplied = Buffer.from(
      raw?.startsWith("Bearer ") ? raw.slice(7) : "",
      "utf8",
    );
    if (
      supplied.length !== this.expected.length ||
      !timingSafeEqual(supplied, this.expected)
    ) {
      throw new UnauthorizedException("Unauthorized");
    }
    return true;
  }
}
