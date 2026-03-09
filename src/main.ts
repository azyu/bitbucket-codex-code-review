import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ServiceLogger } from "@lib/logger";
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
  app.setGlobalPrefix(globalPrefix, {
    exclude: ["/health"],
  });

  app.use(helmet());

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
