import { TriggerType } from "../../entities/review-run.entity";
import { IWebhookPrPayload } from "../../webhook/interfaces/webhook.interfaces";
import { IReviewSettingsSnapshot } from "../../settings/runtime-settings.types";

/** 리뷰 생성 요청 DTO */
export interface ICreateReviewRunParams extends IWebhookPrPayload {
  readonly idempotencyKey: string;
  readonly triggerType: TriggerType;
  readonly triggerCommentId?: number;
  readonly settingsSnapshot: IReviewSettingsSnapshot;
}
