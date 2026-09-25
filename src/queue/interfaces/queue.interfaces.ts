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
  /**
   * 재시도로 끝난 이전 시도들의 사용량 합계. 재시도는 같은 review_runs 행을 쓰므로
   * 최종 기록(완료/실패)이 이 값에 마지막 시도분을 더해 저장한다.
   */
  readonly priorAttemptsUsage?: IReviewAttemptUsage;
}

/** 한 런이 여러 시도에 걸쳐 쓴 Codex 토큰·소요시간. 값이 없던 항목은 비워 둔다. */
export interface IReviewAttemptUsage {
  readonly durationMs?: number;
  readonly totalDurationMs?: number;
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly outputTokens?: number;
}
