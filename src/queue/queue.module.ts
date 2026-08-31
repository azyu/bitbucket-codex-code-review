import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import {
  REVIEW_QUEUE_NAME,
  REVIEW_QUEUE_CONFIG,
} from "../constants/queue.constants";
import { DEFAULTS } from "../config/configuration";
import { ReviewProcessor } from "./review.processor";
import { ReviewModule } from "../review/review.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { CodexModule } from "../codex/codex.module";
import { BitbucketModule } from "../bitbucket/bitbucket.module";

@Module({
  imports: [
    // 큐 등록은 이 모듈에서만 한다 — producer(WebhookModule)가 다시 등록하면
    // defaultJobOptions 없는 별개 인스턴스가 생겨 재시도가 사라진다.
    BullModule.registerQueueAsync({
      name: REVIEW_QUEUE_NAME,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        defaultJobOptions: {
          ...REVIEW_QUEUE_CONFIG.defaultJobOptions,
          attempts: configService.get<number>(
            "queue.retryAttempts",
            DEFAULTS.QUEUE_RETRY_ATTEMPTS,
          ),
          backoff: {
            type: "exponential" as const,
            delay: configService.get<number>(
              "queue.retryDelay",
              DEFAULTS.QUEUE_RETRY_DELAY,
            ),
          },
        },
      }),
    }),
    ReviewModule,
    WorkspaceModule,
    CodexModule,
    BitbucketModule,
  ],
  providers: [ReviewProcessor],
  exports: [BullModule],
})
export class QueueModule {}
