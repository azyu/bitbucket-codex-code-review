import { TriggerType } from "../../entities/review-run.entity";
import { IReviewSettingsSnapshot } from "../../settings/runtime-settings.types";

/** BullMQ 작업 데이터 */
export interface IReviewJobData {
  readonly reviewRunId: number;
  readonly repositorySlug: string;
  readonly workspaceSlug: string;
  readonly pullRequestId: number;
  readonly headCommitHash: string;
  readonly baseCommitHash: string;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly cloneUrl: string;
  readonly idempotencyKey: string;
  readonly triggerType: TriggerType;
  readonly triggerCommentId?: number;
  readonly settings: IReviewSettingsSnapshot;
}
