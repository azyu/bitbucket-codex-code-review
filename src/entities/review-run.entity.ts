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

  @Column({ type: "text", nullable: true })
  errorMessage: string;
}
