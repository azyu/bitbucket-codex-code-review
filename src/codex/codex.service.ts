import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ServiceLogger } from "@lib/logger";
import { spawn } from "child_process";
import { readFile, rm } from "fs/promises";
import { join } from "path";
import { ICodexReviewResult } from "./interfaces/codex.interfaces";
import {
  ICodexUsageMetrics,
  parseCodexErrorLine,
  parseCodexUsageLine,
} from "./codex-output.parser";

const MAX_STDERR_BYTES = 64 * 1024;
const CAPACITY_ERROR_MESSAGE =
  "Selected model is at capacity. Please try a different model.";
const TIMEOUT_EXIT_CODE = 124;
const CODEX_ENV_ALLOWLIST: Record<string, true> = {
  HOME: true,
  LANG: true,
  LC_ALL: true,
  OPENAI_API_KEY: true,
  OPENAI_BASE_URL: true,
  PATH: true,
  TMPDIR: true,
  CODEX_HOME: true,
  HTTP_PROXY: true,
  HTTPS_PROXY: true,
  NO_PROXY: true,
  SSL_CERT_FILE: true,
  SSL_CERT_DIR: true,
  http_proxy: true,
  https_proxy: true,
  no_proxy: true,
};

interface ISpawnResult {
  readonly code: number;
  readonly usage: ICodexUsageMetrics;
  readonly stderr: string;
  readonly codexError: string;
}

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

  private buildCodexArgs(outputFile: string): string[] {
    const args = [
      "exec",
      "--model",
      this.model,
      "--sandbox",
      "read-only",
      "--json",
      "--output-last-message",
      outputFile,
    ];

    if (this.reasoningEffort) {
      args.push("-c", `model_reasoning_effort="${this.reasoningEffort}"`);
    }

    args.push("-");
    return args;
  }

  private buildCodexEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined) {
        continue;
      }

      if (
        !Object.hasOwn(CODEX_ENV_ALLOWLIST, key) ||
        value.includes("\n") ||
        value.includes("\r")
      ) {
        continue;
      }

      env[key] = value;
    }

    return env;
  }

  private spawnCodex(
    args: readonly string[],
    worktreePath: string,
    prompt: string,
  ): Promise<ISpawnResult> {
    return new Promise((resolve) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const child = spawn(this.binaryPath, [...args], {
        cwd: worktreePath,
        env: this.buildCodexEnv(),
        signal: controller.signal,
        stdio: ["pipe", "pipe", "pipe"],
      });

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdin.end(prompt);

      let partialLine = "";
      let lastUsage: ICodexUsageMetrics = {
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
      };
      let stderr = "";
      let spawnError: Error | null = null;
      let codexError = "";

      child.stdout.on("data", (chunk: string) => {
        const text = partialLine + chunk;
        const lines = text.split("\n");
        partialLine = lines.pop() ?? "";

        for (const line of lines) {
          const usage = parseCodexUsageLine(line);
          if (usage) {
            lastUsage = usage;
          }
          const error = parseCodexErrorLine(line);
          if (error) {
            codexError = error;
          }
        }
      });

      child.stderr.on("data", (chunk: string) => {
        if (stderr.length < MAX_STDERR_BYTES) {
          stderr += chunk;
        }
      });

      // Record error but do NOT resolve here — wait for `close`.
      // On Node 24, AbortController emits `error(AbortError)` before
      // `close(null, 'SIGTERM')`. Resolving here would race outputFile
      // reads against a still-running process and return code 1 instead
      // of the intended 124.
      child.on("error", (err: Error) => {
        spawnError = err;
      });

      child.on("close", (code, signal) => {
        clearTimeout(timeoutId);

        // Flush remaining partial line
        if (partialLine) {
          const usage = parseCodexUsageLine(partialLine);
          if (usage) {
            lastUsage = usage;
          }
          const error = parseCodexErrorLine(partialLine);
          if (error) {
            codexError = error;
          }
        }

        const exitCode = signal
          ? TIMEOUT_EXIT_CODE
          : (code ?? 1);

        const stderrOut = stderr.slice(0, MAX_STDERR_BYTES);
        const finalStderr = stderrOut || spawnError?.message || "";

        resolve({
          code: exitCode,
          usage: lastUsage,
          stderr: finalStderr,
          codexError: codexError.slice(0, MAX_STDERR_BYTES),
        });
      });
    });
  }

  /**
   * codex exec 으로 프롬프트 실행 (non-interactive, headless)
   * worktreePath 내에서 실행하며, 호출자가 프롬프트를 지정
   * --output-last-message 로 최종 결과만 파일로 캡처
   * stdout은 라인 스트리밍으로 usage만 추출 (메모리 버퍼 초과 방지)
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
      const args = this.buildCodexArgs(outputFile);
      const result = await this.spawnCodex(args, worktreePath, prompt);
      const durationMs = Date.now() - startTime;

      if (result.code === 0) {
        this.logger.log(`Codex review completed in ${durationMs}ms`);
      } else {
        this.logger.error(
          `Codex review failed in ${durationMs}ms (exit ${result.code}): ${result.codexError || result.stderr || "no error details"}`,
        );
      }

      let rawOutput: string;
      try {
        rawOutput = await readFile(outputFile, "utf-8");
      } catch {
        if (result.code === 0) {
          throw new Error("Codex output file could not be read");
        }
        const publicError =
          result.codexError === CAPACITY_ERROR_MESSAGE
            ? result.codexError
            : result.stderr;
        rawOutput = publicError
          ? `Codex run failed (exit ${result.code}): ${publicError.trim()}`
          : `Codex run failed (exit ${result.code}). Check worker logs for details.`;
      }

      return {
        rawOutput,
        exitCode: result.code,
        durationMs,
        inputTokens: result.usage.inputTokens,
        cachedInputTokens: result.usage.cachedInputTokens,
        outputTokens: result.usage.outputTokens,
      };
    } finally {
      rm(outputFile, { force: true }).catch((err) => {
        this.logger.error(
          `Failed to cleanup output file ${outputFile}: ${(err as Error).message}`,
        );
      });
    }
  }
}
