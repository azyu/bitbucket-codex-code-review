import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { REVIEW_QUEUE_NAME } from "../constants/queue.constants";
import { WebhookController } from "./webhook.controller";
import { WebhookGuard } from "./webhook.guard";
import { TriggerService } from "./trigger.service";
import { ReviewModule } from "../review/review.module";
import { BitbucketModule } from "../bitbucket/bitbucket.module";

@Module({
  imports: [
    BullModule.registerQueue({ name: REVIEW_QUEUE_NAME }),
    ReviewModule,
    BitbucketModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookGuard, TriggerService],
})
export class WebhookModule {}
