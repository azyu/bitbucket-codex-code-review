/**
 * Review response shapes shared by the internal API and the dashboard UI.
 *
 * Like `../config/limits`, this module must stay dependency-free — the
 * dashboard imports it directly, so a TypeORM or Nest import here would drag
 * the server into the browser bundle. The enums live here rather than on the
 * entity for that reason; `review-run.entity.ts` re-exports them.
 *
 * `Date` fields are declared as `Date` because that is what the server hands to
 * the serializer. Over the wire they are ISO strings — the dashboard applies
 * its own `Wire<T>` mapping at the fetch boundary.
 */

import { type IReviewSettingsSnapshot } from "../settings/runtime-settings.types";

/** 리뷰 실행 상태 */
export enum ReviewRunStatus {
  QUEUED = "queued",
  PREPARING = "preparing",
  REVIEWING = "reviewing",
  PUBLISHING = "publishing",
  COMPLETED = "completed",
  FAILED = "failed",
  SUPERSEDED = "superseded",
}

/** 트리거 유형 */
export enum TriggerType {
  MENTION = "mention",
  AUTO = "auto",
}

export interface IRecentReview {
  readonly id: number;
  readonly workspaceSlug: string;
  readonly repositorySlug: string;
  readonly pullRequestId: number;
  readonly headCommitHash: string;
  readonly reviewStatus: ReviewRunStatus;
  readonly triggerType: TriggerType;
  readonly errorMessage: string | null;
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
  readonly durationMs: number | null;
  readonly totalDurationMs: number | null;
  readonly codexModel: string | null;
  readonly codexReasoningEffort: string | null;
  readonly createdAt: Date;
}

export interface ILatestReviewStats {
  readonly id: number;
  readonly workspaceSlug: string;
  readonly repositorySlug: string;
  readonly pullRequestId: number;
  readonly reviewStatus: ReviewRunStatus;
  readonly durationMs: number | null;
  readonly totalDurationMs: number | null;
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
  readonly createdAt: Date;
}

export interface IRepoStatsOverview {
  readonly workspaceSlug: string;
  readonly repoSlug: string;
  readonly counts: {
    readonly total: number;
    readonly completed: number;
    readonly failed: number;
    readonly superseded: number;
  };
  readonly durations: {
    readonly codexTotalMs: number;
    readonly codexAvgMs: number;
    readonly reviewTotalMs: number;
    readonly reviewAvgMs: number;
  };
  readonly tokens: {
    readonly inputTokens: number;
    readonly cachedInputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
  readonly latestReview: ILatestReviewStats | null;
}

/**
 * The `ReviewRunEntity` fields the dashboard reads from
 * `/api/internal/reviews/:id` and `.../latest`.
 *
 * `ReviewRunEntity implements IReviewRunDetail`, so dropping or retyping a
 * column the dashboard renders is a compile error rather than a runtime
 * `undefined`. Field types mirror the entity's declarations, including the
 * nullable columns it declares non-null — the UI treats those as possibly
 * absent regardless. `status` is deliberately omitted: it is served but unused.
 */
export interface IReviewRunDetail {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  repositorySlug: string;
  workspaceSlug: string;
  pullRequestId: number;
  headCommitHash: string;
  baseCommitHash: string;
  baseBranch: string;
  headBranch: string;
  idempotencyKey: string;
  settingsSnapshot: IReviewSettingsSnapshot | null;
  triggerType: TriggerType;
  triggerCommentId: number;
  reviewStatus: ReviewRunStatus;
  reviewOutput: string;
  resultCommentId: number;
  durationMs: number;
  totalDurationMs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  codexModel: string;
  codexReasoningEffort: string;
  errorMessage: string;
}
