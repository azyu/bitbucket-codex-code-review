import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Not, Repository } from "typeorm";
import { ServiceLogger } from "@lib/logger";
import {
  ReviewRunEntity,
  ReviewRunStatus,
} from "../entities/review-run.entity";
import { ICreateReviewRunParams } from "./interfaces/review.interfaces";

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
        "reviewOutput" | "resultCommentId" | "durationMs" | "errorMessage"
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
}
