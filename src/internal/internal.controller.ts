import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from "@nestjs/common";
import { ReviewService } from "../review/review.service";
import { ReviewRunEntity } from "../entities/review-run.entity";
import {
  type IRecentReview,
  type IRepoStatsOverview,
} from "../review/review.service";

/**
 * Internal API.
 *
 * 주의: 현재 ingress(`/`) prefix 매칭으로 외부 ALB(codex-code-review.dev.kitkit.us)에서도
 * `/api/internal/*` 경로가 도달 가능하다. 인프라 레이어 차단은 별도 PR로 진행 예정이며,
 * 본 컨트롤러의 응답에는 항상 앱 레이어 가드(필드 whitelist + sanitize)를 적용한다.
 */
@Controller("internal")
export class InternalController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get("reviews/recent")
  async listRecentReviews(
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<ReadonlyArray<IRecentReview>> {
    return this.reviewService.listRecent(limit);
  }

  @Get("reviews/:repoSlug/:prId/latest")
  async getLatestReview(
    @Param("repoSlug") repoSlug: string,
    @Param("prId", ParseIntPipe) prId: number,
  ): Promise<ReviewRunEntity | null> {
    return this.reviewService.findLatestByPr(repoSlug, prId);
  }

  @Get("reviews/:id")
  async getReviewById(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<ReviewRunEntity | null> {
    return this.reviewService.findById(id);
  }

  @Get("stats/repos/:repoSlug")
  async getRepoStats(
    @Param("repoSlug") repoSlug: string,
  ): Promise<IRepoStatsOverview> {
    return this.reviewService.getRepoStats(repoSlug);
  }

  @Get("stats/repos")
  async listRepoStats(): Promise<ReadonlyArray<IRepoStatsOverview>> {
    return this.reviewService.listRepoStats();
  }
}
