import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ServiceLogger } from "@lib/logger";
import { spawn } from "child_process";
import { readFile, rm } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import {
  ICodexAuthStatus,
  ICodexReviewResult,
} from "./interfaces/codex.interfaces";
import {
  ICodexUsageMetrics,
  parseCodexErrorLine,
  parseCodexUsageLine,
} from "./codex-output.parser";
import {
  IOpenAiConnectionSnapshot,
  IReviewSettingsSnapshot,
} from "../settings/runtime-settings.types";

const MAX_STDERR_BYTES = 64 * 1024;
const CAPACITY_ERROR_MESSAGE =
  "Selected model is at capacity. Please try a different model.";
const TIMEOUT_EXIT_CODE = 124;
const AUTH_FILE_NAME = "auth.json";
const CHATGPT_AUTH_MODE = "chatgpt";
const CODEX_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "HTTP_PROXY",
  "http_proxy",
  "HTTPS_PROXY",
  "https_proxy",
  "NO_PROXY",
  "ALL_PROXY",
  "all_proxy",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "CODEX_HOME",
] as const;

function toIso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

/** JWT payload에서 exp/iat만 꺼낸다. 서명은 검증하지 않는다 — 발급자는 codex다. */
function decodeJwtClaims(
  token: string,
): { exp: number; iat: number | null } | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8"),
    ) as Record<string, unknown>;
    const exp = claims["exp"];
    if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
    const iat = claims["iat"];
    return { exp, iat: typeof iat === "number" && Number.isFinite(iat) ? iat : null };
  } catch {
    return null;
  }
}

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

  constructor(private readonly configService: ConfigService) {
    this.binaryPath = this.configService.getOrThrow<string>("codex.binaryPath");
  }

  private buildCodexArgs(
    outputFile: string,
    settings: IReviewSettingsSnapshot,
    connection: IOpenAiConnectionSnapshot,
  ): string[] {
    const args = [
      "exec",
      "--model",
      settings.model,
      "--sandbox",
      "read-only",
      "--json",
      "--output-last-message",
      outputFile,
    ];
    if (settings.reasoningEffort) {
      args.push("-c", `model_reasoning_effort="${settings.reasoningEffort}"`);
    }
    if (connection.baseUrl) {
      args.push("-c", 'model_provider="openai"');
      args.push("-c", `openai_base_url=${JSON.stringify(connection.baseUrl)}`);
    }
    args.push("-");
    return args;
  }

  private buildCodexEnv(
    connection: IOpenAiConnectionSnapshot,
  ): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const key of CODEX_ENV_ALLOWLIST) {
      const value = process.env[key];
      if (value !== undefined && !value.includes("\n") && !value.includes("\r")) {
        env[key] = value;
      }
    }
    if (connection.apiKey) env["OPENAI_API_KEY"] = connection.apiKey;
    return env;
  }

  private spawnCodex(
    args: readonly string[],
    worktreePath: string,
    prompt: string,
    timeoutMs: number,
    connection: IOpenAiConnectionSnapshot,
  ): Promise<ISpawnResult> {
    return new Promise((resolve) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const child = spawn(this.binaryPath, [...args], {
        cwd: worktreePath,
        env: this.buildCodexEnv(connection),
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

  private authFilePath(): string {
    const home = process.env["CODEX_HOME"] || join(homedir(), ".codex");
    return join(home, AUTH_FILE_NAME);
  }

  /**
   * codex의 ChatGPT 세션 상태를 auth.json만 읽어 판정한다. 네트워크 호출 없음.
   *
   * ⚠️ **access_token의 만료만 본다. refresh_token이 살아 있는지는 알 수 없다.**
   * codex는 access_token이 유효한 동안 refresh 엔드포인트를 건드리지 않으므로,
   * 무효화된 refresh_token은 access_token이 만료될 때까지(최대 10일) 증상이 없다.
   * 그 구간을 덮으려면 주기적으로 실제 `codex exec`을 돌리는 수밖에 없다.
   *
   * 반대 방향의 한계도 있다 — 리뷰가 한동안 없으면 갱신이 일어나지 않아 만료로
   * 보이지만, 다음 리뷰가 정상 갱신할 수도 있다. `expired`는 "고장"이 아니라
   * "사람이 확인할 것"이다.
   */
  async getAuthStatus(): Promise<ICodexAuthStatus> {
    const unknown = (
      reason: NonNullable<ICodexAuthStatus["reason"]>,
      authMode: string | null = null,
    ): ICodexAuthStatus => ({
      status: "unknown",
      reason,
      authMode,
      issuedAt: null,
      expiresAt: null,
      expiresInSeconds: null,
      lastRefresh: null,
    });

    let raw: string;
    try {
      raw = await readFile(this.authFilePath(), "utf-8");
    } catch {
      return unknown("missing");
    }

    // 파서 에러 메시지는 파일 내용을 그대로 인용할 수 있어 밖으로 내보내지 않는다.
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return unknown("malformed");
    }
    if (typeof doc !== "object" || doc === null) return unknown("malformed");

    const authMode = typeof doc["auth_mode"] === "string" ? doc["auth_mode"] : null;
    const lastRefresh =
      typeof doc["last_refresh"] === "string" ? doc["last_refresh"] : null;

    if (authMode !== CHATGPT_AUTH_MODE) {
      // API key 모드에는 만료가 없다 — 이 엔드포인트가 답할 수 있는 질문이 아니다.
      return {
        status: "unsupported_mode",
        reason: null,
        authMode,
        issuedAt: null,
        expiresAt: null,
        expiresInSeconds: null,
        lastRefresh,
      };
    }

    const tokens = doc["tokens"];
    const accessToken =
      typeof tokens === "object" && tokens !== null
        ? (tokens as Record<string, unknown>)["access_token"]
        : undefined;
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      return unknown("no_token", authMode);
    }

    const claims = decodeJwtClaims(accessToken);
    if (!claims) return unknown("bad_jwt", authMode);

    const nowSeconds = Math.floor(Date.now() / 1000);
    return {
      status: claims.exp > nowSeconds ? "ok" : "expired",
      reason: null,
      authMode,
      issuedAt: claims.iat === null ? null : toIso(claims.iat),
      expiresAt: toIso(claims.exp),
      expiresInSeconds: claims.exp - nowSeconds,
      lastRefresh,
    };
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
    settings: IReviewSettingsSnapshot,
    connection: IOpenAiConnectionSnapshot,
  ): Promise<ICodexReviewResult> {
    const startTime = Date.now();
    const outputFile = join(
      "/tmp",
      `codex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`,
    );

    this.logger.log(
      `Starting codex exec in ${worktreePath}, base: ${baseBranch}, model: ${settings.model}, reasoning: ${settings.reasoningEffort || "default"}`,
    );

    try {
      const args = this.buildCodexArgs(outputFile, settings, connection);
      const result = await this.spawnCodex(
        args,
        worktreePath,
        prompt,
        settings.timeoutMs,
        connection,
      );
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
        model: settings.model,
        reasoningEffort: settings.reasoningEffort || null,
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
