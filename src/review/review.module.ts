import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReviewRunEntity } from "../entities/review-run.entity";
import { ReviewService } from "./review.service";

@Module({
  imports: [TypeOrmModule.forFeature([ReviewRunEntity])],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
