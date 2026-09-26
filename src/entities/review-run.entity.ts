import { Column, Entity, Index } from "typeorm";
import { BaseTableEntity, SCHEMA_NAME_CODE_REVIEW } from "@lib/index";
import { IReviewSettingsSnapshot } from "../settings/runtime-settings.types";
import {
  type IReviewRunDetail,
  ReviewRunStatus,
  TriggerType,
} from "../review/review.types";

// Declared in review/review.types.ts so the dashboard can import them without
// pulling TypeORM into the browser bundle. Re-exported because every existing
// importer reads them from this path.
export { ReviewRunStatus, TriggerType };

@Entity("review_runs", { database: SCHEMA_NAME_CODE_REVIEW })
@Index(["repositorySlug", "pullRequestId", "createdAt"])
@Index(["idempotencyKey"], { unique: true })
export class ReviewRunEntity
  extends BaseTableEntity
  implements IReviewRunDetail
{
  @Column({ type: "varchar", length: 255 })
  repositorySlug: string;

  @Column({ type: "varchar", length: 255 })
  workspaceSlug: string;

  @Column({ type: "int" })
  pullRequestId: number;

  @Column({ type: "varchar", length: 40 })
  headCommitHash: string;

  @Column({ type: "varchar", length: 40, nullable: true })
  baseCommitHash: string;

  @Column({ type: "varchar", length: 255 })
  baseBranch: string;

  @Column({ type: "varchar", length: 255 })
  headBranch: string;

  @Column({ type: "varchar", length: 600 })
  idempotencyKey: string;

  @Column({ type: "json", nullable: true })
  settingsSnapshot: IReviewSettingsSnapshot | null;

  @Column({ type: "enum", enum: TriggerType, default: TriggerType.MENTION })
  triggerType: TriggerType;

  @Column({ type: "bigint", nullable: true })
  triggerCommentId: number;

  @Column({
    type: "enum",
    enum: ReviewRunStatus,
    default: ReviewRunStatus.QUEUED,
  })
  reviewStatus: ReviewRunStatus;

  @Column({ type: "text", nullable: true })
  reviewOutput: string;

  @Column({ type: "bigint", nullable: true })
  resultCommentId: number;

  @Column({ type: "int", nullable: true })
  durationMs: number;

  @Column({ type: "int", nullable: true })
  totalDurationMs: number;

  @Column({ type: "int", nullable: true })
  inputTokens: number;

  @Column({ type: "int", nullable: true })
  cachedInputTokens: number;

  @Column({ type: "int", nullable: true })
  outputTokens: number;

  // 토큰·소요 통계를 어떤 모델 설정으로 얻었는지 귀속하기 위한 값. codex는 지원하지
  // 않는 모델을 받으면 400으로 실패하므로, 완주한 run의 이 값은 실제 사용 설정과 같다.
  @Column({ type: "varchar", length: 64, nullable: true })
  codexModel: string;

  @Column({ type: "varchar", length: 16, nullable: true })
  codexReasoningEffort: string;

  @Column({ type: "text", nullable: true })
  errorMessage: string;

  // Codex에 stdin으로 넘긴 최종 프롬프트. 최대 90만 자라 TEXT(64KB)로는 strict
  // sql_mode에서 update가 실패한다. 수 MB가 될 수 있어 기본 조회에서 빼고
  // ReviewService.findPromptById로만 읽는다.
  @Column({ type: "mediumtext", nullable: true, select: false })
  reviewPrompt: string | null;

  // 시스템 프롬프트·도구 정의가 CLI 버전마다 달라지므로 재현 조건으로 남긴다.
  @Column({ type: "varchar", length: 64, nullable: true })
  codexCliVersion: string | null;

  // 실제 diff 기준. baseCommitHash는 webhook 시점의 base tip이라 이것과 다를 수 있다.
  @Column({ type: "varchar", length: 40, nullable: true })
  reviewMergeBase: string | null;
}
