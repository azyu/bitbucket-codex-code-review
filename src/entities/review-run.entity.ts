import { Column, Entity, Index } from "typeorm";
import { BaseTableEntity, SCHEMA_NAME_CODE_REVIEW } from "@lib/index";

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

@Entity("review_runs", { database: SCHEMA_NAME_CODE_REVIEW })
@Index(["repositorySlug", "pullRequestId", "createdAt"])
@Index(["idempotencyKey"], { unique: true })
export class ReviewRunEntity extends BaseTableEntity {
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

  @Column({ type: "varchar", length: 255 })
  idempotencyKey: string;

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
}
