import { Module } from "@nestjs/common";
import { BitbucketService } from "./bitbucket.service";

@Module({
  providers: [BitbucketService],
  exports: [BitbucketService],
})
export class BitbucketModule {}
