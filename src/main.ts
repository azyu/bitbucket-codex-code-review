import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import {
  DASHBOARD_BASE_PATH,
  DASHBOARD_CSP_DIRECTIVES,
  isDashboardPath,
} from "./dashboard-csp";
import { ServiceLogger } from "@lib/logger";
import { configureBodyParser } from "@lib/body-parser";
import { initOpenTelemetry } from "@lib/opentelemetry";

const SERVICE_NAME = "code-review";

async function bootstrap(): Promise<string> {
  // Initialize OpenTelemetry BEFORE creating NestJS application
  await initOpenTelemetry(SERVICE_NAME);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
    logger: new ServiceLogger(SERVICE_NAME),
  });

  // Configure HTTP server
  const globalPrefix = "api";
  // The dashboard is served by static middleware, which sits outside Nest's
  // router and so needs no exclude entry — the health routes are the only
  // excluded ones. /health/codex-auth is listed separately because exclude
  // matches exact paths, not prefixes: without its own entry it would be
  // served at /api/health/codex-auth.
  app.setGlobalPrefix(globalPrefix, {
    exclude: ["/health", "/health/codex-auth"],
  });

  const defaultHelmet = helmet();
  const dashboardHelmet = helmet({
    contentSecurityPolicy: {
      directives: { ...DASHBOARD_CSP_DIRECTIVES },
    },
  });

  app.use(
    (
      ...args: Parameters<ReturnType<typeof helmet>>
    ) => {
      const [req] = args;
      const { pathname } = new URL(req.url ?? "", "http://localhost");
      return isDashboardPath(pathname)
        ? dashboardHelmet(...args)
        : defaultHelmet(...args);
    },
  );

  // After the helmet selector so the document and its assets carry the
  // dashboard CSP. `dist/dashboard` is where the dashboard package's Vite
  // build writes, which is inside the tree the Dockerfile already copies.
  app.useStaticAssets(join(__dirname, "dashboard"), {
    prefix: DASHBOARD_BASE_PATH,
  });

  // After helmet so a 413 response still carries the security headers, and
  // before listen() so Nest skips registering its default-limit json parser.
  configureBodyParser(app);

  const port = process.env["PORT"]!; // Required by validation.ts

  await app.listen(port, "0.0.0.0");

  const logger = new ServiceLogger(SERVICE_NAME);
  const gitCommitHash = process.env["GIT_COMMIT_HASH"] || "unknown";
  logger.log(`Git Commit Hash: ${gitCommitHash}`);
  logger.log(
    `HTTP Server is running on: http://localhost:${port}/${globalPrefix}`,
  );

  return `http://localhost:${port}/${globalPrefix}`;
}

bootstrap();
