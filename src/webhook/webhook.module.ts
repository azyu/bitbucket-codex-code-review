import { Module } from "@nestjs/common";
import { WebhookController } from "./webhook.controller";
import { WebhookGuard } from "./webhook.guard";
import { TriggerService } from "./trigger.service";
import { QueueModule } from "../queue/queue.module";
import { ReviewModule } from "../review/review.module";
import { BitbucketModule } from "../bitbucket/bitbucket.module";

@Module({
  // 큐는 QueueModule이 등록한 인스턴스를 재사용한다 (defaultJobOptions 유지)
  imports: [QueueModule, ReviewModule, BitbucketModule],
  controllers: [WebhookController],
  providers: [WebhookGuard, TriggerService],
})
export class WebhookModule {}
