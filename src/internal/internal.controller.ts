import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { ReviewService } from "../review/review.service";
import { ReviewRunEntity } from "../entities/review-run.entity";

/**
 * Internal API — exposed only within the cluster network (not publicly routed).
 * Access is restricted at the infrastructure level (K8s NetworkPolicy / ingress rules).
 */
@Controller("internal")
export class InternalController {
  constructor(private readonly reviewService: ReviewService) {}

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
}
