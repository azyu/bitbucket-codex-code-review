import { Module } from "@nestjs/common";
import { CodexService } from "./codex.service";

@Module({
  providers: [CodexService],
  exports: [CodexService],
})
export class CodexModule {}
