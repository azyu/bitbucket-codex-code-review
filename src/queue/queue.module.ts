import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import {
  REVIEW_QUEUE_NAME,
  REVIEW_QUEUE_CONFIG,
} from "../constants/queue.constants";
import { ReviewProcessor } from "./review.processor";
import { ReviewModule } from "../review/review.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { CodexModule } from "../codex/codex.module";
import { BitbucketModule } from "../bitbucket/bitbucket.module";

@Module({
  imports: [
    BullModule.registerQueue({
      name: REVIEW_QUEUE_NAME,
      defaultJobOptions: REVIEW_QUEUE_CONFIG.defaultJobOptions,
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
