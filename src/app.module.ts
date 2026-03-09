import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DatabaseModule } from "./database/database.module";
import { OpenTelemetryModule } from "@lib/opentelemetry.module";
import { QueueModule } from "./queue/queue.module";
import { WebhookModule } from "./webhook/webhook.module";
import { ReviewModule } from "./review/review.module";
import { WorkspaceModule } from "./workspace/workspace.module";
import { CodexModule } from "./codex/codex.module";
import { BitbucketModule } from "./bitbucket/bitbucket.module";
import { InternalController } from "./internal/internal.controller";
import configuration, { DEFAULTS } from "./config/configuration";
import { validationSchema } from "./config/validation";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get("redis.queue.host"),
          port: configService.get("redis.queue.port"),
          username: configService.get("redis.queue.username"),
          password: configService.get("redis.queue.password"),
          db: configService.get("redis.queue.db", 0),
        },
      }),
      inject: [ConfigService],
    }),
    DatabaseModule,
    OpenTelemetryModule.forRoot({
      serviceName: "code-review",
      serviceVersion: process.env["SERVICE_VERSION"] || "1.0.0",
      metrics: {
        enabled: true,
        port: Number(process.env["METRICS_PORT"]) || DEFAULTS.METRICS_PORT,
      },
    }),
    QueueModule,
    WebhookModule,
    ReviewModule,
    WorkspaceModule,
    CodexModule,
    BitbucketModule,
  ],
  controllers: [AppController, InternalController],
  providers: [AppService],
})
export class AppModule {}
