import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Not, Repository } from "typeorm";
import { ServiceLogger } from "@lib/logger";
import {
  ReviewRunEntity,
  ReviewRunStatus,
} from "../entities/review-run.entity";
import { ICreateReviewRunParams } from "./interfaces/review.interfaces";

export interface ILatestReviewStats {
  readonly id: number;
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

interface IRepoAggregateRow {
  readonly repositorySlug: string;
  readonly totalCount: string | number | null;
  readonly completedCount: string | number | null;
  readonly failedCount: string | number | null;
  readonly supersededCount: string | number | null;
  readonly codexTotalMs: string | number | null;
  readonly codexAvgMs: string | number | null;
  readonly reviewTotalMs: string | number | null;
  readonly reviewAvgMs: string | number | null;
  readonly inputTokens: string | number | null;
  readonly cachedInputTokens: string | number | null;
  readonly outputTokens: string | number | null;
}

interface ILatestReviewRow {
  readonly id: number;
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

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return 0;
}

function toNullableNumber(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return toNumber(value);
}

@Injectable()
export class ReviewService {
  private readonly logger = new ServiceLogger(ReviewService.name);

  constructor(
    @InjectRepository(ReviewRunEntity)
    private readonly reviewRunRepository: Repository<ReviewRunEntity>,
  ) {}

  /** 새 리뷰 실행 레코드 생성 */
  async createReviewRun(
    params: ICreateReviewRunParams,
  ): Promise<ReviewRunEntity> {
    const entity = this.reviewRunRepository.create({
      repositorySlug: params.repositorySlug,
      workspaceSlug: params.workspaceSlug,
      pullRequestId: params.pullRequestId,
      headCommitHash: params.headCommitHash,
      baseCommitHash: params.baseCommitHash,
      baseBranch: params.baseBranch,
      headBranch: params.headBranch,
      idempotencyKey: params.idempotencyKey,
      triggerType: params.triggerType,
      triggerCommentId: params.triggerCommentId,
      reviewStatus: ReviewRunStatus.QUEUED,
    });

    const saved = await this.reviewRunRepository.save(entity);
    this.logger.log(
      `Review run created: id=${saved.id}, key=${params.idempotencyKey}`,
    );
    return saved;
  }

  /** idempotency key로 중복 확인 (FAILED는 재시도 허용) */
  async existsByIdempotencyKey(idempotencyKey: string): Promise<boolean> {
    const existing = await this.reviewRunRepository.findOne({
      where: { idempotencyKey },
      select: ["id", "reviewStatus"],
    });

    if (!existing) return false;

    // FAILED → 재시도 허용: 기존 레코드 삭제
    if (existing.reviewStatus === ReviewRunStatus.FAILED) {
      await this.reviewRunRepository.delete(existing.id);
      this.logger.log(
        `Removed failed review run (id=${existing.id}) for retry: ${idempotencyKey}`,
      );
      return false;
    }

    return true;
  }

  /** 리뷰 상태 업데이트 */
  async updateStatus(
    id: number,
    reviewStatus: ReviewRunStatus,
    extra?: Partial<
      Pick<
        ReviewRunEntity,
        | "reviewOutput"
        | "resultCommentId"
        | "durationMs"
        | "totalDurationMs"
        | "inputTokens"
        | "cachedInputTokens"
        | "outputTokens"
        | "errorMessage"
      >
    >,
  ): Promise<void> {
    await this.reviewRunRepository.update(id, { reviewStatus, ...extra });
  }

  /** 특정 PR의 최근 리뷰 결과 조회 */
  async findLatestByPr(
    repositorySlug: string,
    pullRequestId: number,
  ): Promise<ReviewRunEntity | null> {
    return this.reviewRunRepository.findOne({
      where: { repositorySlug, pullRequestId },
      order: { createdAt: "DESC" },
    });
  }

  /** ID로 리뷰 조회 */
  async findById(id: number): Promise<ReviewRunEntity | null> {
    return this.reviewRunRepository.findOne({ where: { id } });
  }

  async getRepoStats(repositorySlug: string): Promise<IRepoStatsOverview> {
    const aggregates = await this.queryRepoAggregates(repositorySlug);
    const latestByRepo = await this.queryLatestReviews(repositorySlug);

    return this.buildRepoStatsOverview(
      repositorySlug,
      aggregates[0],
      latestByRepo.get(repositorySlug) ?? null,
    );
  }

  async listRepoStats(): Promise<ReadonlyArray<IRepoStatsOverview>> {
    const aggregates = await this.queryRepoAggregates();
    const latestByRepo = await this.queryLatestReviews();

    return aggregates
      .map((aggregate) =>
        this.buildRepoStatsOverview(
          aggregate.repositorySlug,
          aggregate,
          latestByRepo.get(aggregate.repositorySlug) ?? null,
        ),
      )
      .sort((left, right) => {
        const leftTime = left.latestReview
          ? new Date(left.latestReview.createdAt).getTime()
          : 0;
        const rightTime = right.latestReview
          ? new Date(right.latestReview.createdAt).getTime()
          : 0;
        return rightTime - leftTime;
      });
  }

  /** 같은 PR의 진행 중인 리뷰를 SUPERSEDED로 전환 */
  async supersedeActivePrReviews(
    repositorySlug: string,
    pullRequestId: number,
    excludeId: number,
  ): Promise<number> {
    const activeStatuses = [
      ReviewRunStatus.QUEUED,
      ReviewRunStatus.PREPARING,
      ReviewRunStatus.REVIEWING,
      ReviewRunStatus.PUBLISHING,
    ];

    const result = await this.reviewRunRepository.update(
      {
        repositorySlug,
        pullRequestId,
        reviewStatus: In(activeStatuses),
        id: Not(excludeId),
      },
      { reviewStatus: ReviewRunStatus.SUPERSEDED },
    );

    const affected = result.affected ?? 0;
    if (affected > 0) {
      this.logger.log(
        `Superseded ${affected} active review(s) for ${repositorySlug}:PR#${pullRequestId}`,
      );
    }
    return affected;
  }

  private async queryRepoAggregates(
    repositorySlug?: string,
  ): Promise<ReadonlyArray<IRepoAggregateRow>> {
    const sql = `
      SELECT
        repositorySlug AS repositorySlug,
        COUNT(*) AS totalCount,
        SUM(CASE WHEN reviewStatus = 'completed' THEN 1 ELSE 0 END) AS completedCount,
        SUM(CASE WHEN reviewStatus = 'failed' THEN 1 ELSE 0 END) AS failedCount,
        SUM(CASE WHEN reviewStatus = 'superseded' THEN 1 ELSE 0 END) AS supersededCount,
        COALESCE(SUM(durationMs), 0) AS codexTotalMs,
        COALESCE(AVG(durationMs), 0) AS codexAvgMs,
        COALESCE(SUM(totalDurationMs), 0) AS reviewTotalMs,
        COALESCE(AVG(totalDurationMs), 0) AS reviewAvgMs,
        COALESCE(SUM(inputTokens), 0) AS inputTokens,
        COALESCE(SUM(cachedInputTokens), 0) AS cachedInputTokens,
        COALESCE(SUM(outputTokens), 0) AS outputTokens
      FROM review_runs
      ${repositorySlug ? "WHERE repositorySlug = ?" : ""}
      GROUP BY repositorySlug
    `;

    return this.reviewRunRepository.query(
      sql,
      repositorySlug ? [repositorySlug] : [],
    );
  }

  private async queryLatestReviews(
    repositorySlug?: string,
  ): Promise<Map<string, ILatestReviewStats>> {
    const sql = `
      SELECT
        rr.id AS id,
        rr.repositorySlug AS repositorySlug,
        rr.pullRequestId AS pullRequestId,
        rr.reviewStatus AS reviewStatus,
        rr.durationMs AS durationMs,
        rr.totalDurationMs AS totalDurationMs,
        rr.inputTokens AS inputTokens,
        rr.cachedInputTokens AS cachedInputTokens,
        rr.outputTokens AS outputTokens,
        rr.createdAt AS createdAt
      FROM review_runs rr
      INNER JOIN (
        SELECT repositorySlug, MAX(createdAt) AS latestCreatedAt
        FROM review_runs
        ${repositorySlug ? "WHERE repositorySlug = ?" : ""}
        GROUP BY repositorySlug
      ) latest
        ON latest.repositorySlug = rr.repositorySlug
       AND latest.latestCreatedAt = rr.createdAt
      ${repositorySlug ? "WHERE rr.repositorySlug = ?" : ""}
      ORDER BY rr.createdAt DESC
    `;

    const params = repositorySlug
      ? [repositorySlug, repositorySlug]
      : [];
    const rows = await this.reviewRunRepository.query(
      sql,
      params,
    ) as ReadonlyArray<ILatestReviewRow>;

    return new Map(
      rows.map((row) => [
        row.repositorySlug,
        {
          id: toNumber(row.id),
          repositorySlug: row.repositorySlug,
          pullRequestId: toNumber(row.pullRequestId),
          reviewStatus: row.reviewStatus,
          durationMs: toNullableNumber(row.durationMs),
          totalDurationMs: toNullableNumber(row.totalDurationMs),
          inputTokens: toNullableNumber(row.inputTokens),
          cachedInputTokens: toNullableNumber(row.cachedInputTokens),
          outputTokens: toNullableNumber(row.outputTokens),
          createdAt: new Date(row.createdAt),
        },
      ]),
    );
  }

  private buildRepoStatsOverview(
    repositorySlug: string,
    aggregate: IRepoAggregateRow | undefined,
    latestReview: ILatestReviewStats | null,
  ): IRepoStatsOverview {
    const inputTokens = toNumber(aggregate?.inputTokens);
    const outputTokens = toNumber(aggregate?.outputTokens);

    return {
      repoSlug: repositorySlug,
      counts: {
        total: toNumber(aggregate?.totalCount),
        completed: toNumber(aggregate?.completedCount),
        failed: toNumber(aggregate?.failedCount),
        superseded: toNumber(aggregate?.supersededCount),
      },
      durations: {
        codexTotalMs: toNumber(aggregate?.codexTotalMs),
        codexAvgMs: toNumber(aggregate?.codexAvgMs),
        reviewTotalMs: toNumber(aggregate?.reviewTotalMs),
        reviewAvgMs: toNumber(aggregate?.reviewAvgMs),
      },
      tokens: {
        inputTokens,
        cachedInputTokens: toNumber(aggregate?.cachedInputTokens),
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      latestReview,
    };
  }
}
