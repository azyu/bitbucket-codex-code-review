import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ServiceLogger } from "@lib/logger";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, rm } from "fs/promises";
import { join } from "path";
import { ICodexReviewResult } from "./interfaces/codex.interfaces";

const execFileAsync = promisify(execFile);

@Injectable()
export class CodexService {
  private readonly logger = new ServiceLogger(CodexService.name);
  private readonly binaryPath: string;
  private readonly timeoutMs: number;
  private readonly model: string;
  private readonly reasoningEffort: string;

  constructor(private readonly configService: ConfigService) {
    this.binaryPath = this.configService.getOrThrow<string>("codex.binaryPath");
    this.timeoutMs = this.configService.getOrThrow<number>("codex.timeoutMs");
    this.model = this.configService.getOrThrow<string>("codex.model");
    this.reasoningEffort = this.configService.get<string>(
      "codex.reasoningEffort",
      "",
    );
  }

  /**
   * codex exec 으로 프롬프트 실행 (non-interactive, headless)
   * worktreePath 내에서 실행하며, 호출자가 프롬프트를 지정
   * --output-last-message 로 최종 결과만 파일로 캡처
   */
  async executeCodex(
    worktreePath: string,
    baseBranch: string,
    prompt: string,
  ): Promise<ICodexReviewResult> {
    const startTime = Date.now();
    const outputFile = join(
      "/tmp",
      `codex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`,
    );

    this.logger.log(
      `Starting codex exec in ${worktreePath}, base: ${baseBranch}, model: ${this.model}, reasoning: ${this.reasoningEffort || "default"}`,
    );

    try {
      const args = [
        "exec",
        "--model",
        this.model,
        "--sandbox",
        "read-only",
        "--output-last-message",
        outputFile,
      ];

      if (this.reasoningEffort) {
        args.push("-c", `model_reasoning_effort="${this.reasoningEffort}"`);
      }

      args.push(prompt);

      await execFileAsync(
        this.binaryPath,
        args,
        {
          cwd: worktreePath,
          timeout: this.timeoutMs,
          maxBuffer: 10 * 1024 * 1024, // 10MB
        },
      );

      const durationMs = Date.now() - startTime;
      this.logger.log(`Codex review completed in ${durationMs}ms`);

      let rawOutput: string;
      try {
        rawOutput = await readFile(outputFile, "utf-8");
      } catch (err) {
        throw new Error(
          `Codex output file could not be read: ${(err as Error).message}`,
        );
      }

      return { rawOutput, exitCode: 0, durationMs };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const error = err as {
        code?: number;
        stdout?: string;
        stderr?: string;
        message: string;
      };

      this.logger.error(
        `Codex review failed after ${durationMs}ms: ${error.message}`,
      );

      return {
        rawOutput: error.stdout || error.message,
        exitCode: error.code || 1,
        durationMs,
      };
    } finally {
      // Cleanup output file
      rm(outputFile, { force: true }).catch((err) => {
        this.logger.error(
          `Failed to cleanup output file ${outputFile}: ${(err as Error).message}`,
        );
      });
    }
  }
}
