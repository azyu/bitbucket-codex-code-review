import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ServiceLogger } from "@lib/logger";
import { execFile, spawn } from "child_process";
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
// Codex CLI's own fixed wording, safe to publish. Anything else may echo
// server bodies or credentials, so it stays in worker logs only.
const PUBLIC_CODEX_ERRORS = [
  /^Selected model is at capacity\. Please try a different model\.$/,
  /^Quota exceeded\. Check your plan and billing details\.$/,
];
// The usage-limit wording varies by plan and has an open-ended suffix, so it is
// never published verbatim: only a fixed sentence plus the reset time, which
// must look like codex's "%-I:%M %p" / "%H:%M on %-d %b %Y" formats.
const USAGE_LIMIT_ERROR = /^You.ve hit your usage limit\b/;
const USAGE_LIMIT_RESET_TIME =
  /[Tt]ry again at (\d{1,2}:\d{2}(?: [AP]M)?(?: on \d{1,2} [A-Z][a-z]{2}(?: \d{4})?)?)\./;
const TIMEOUT_EXIT_CODE = 124;
const AUTH_FILE_NAME = "auth.json";
const CHATGPT_AUTH_MODE = "chatgpt";
const CLI_VERSION_TIMEOUT_MS = 10_000;
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

/**
 * auth.json에서 읽은 시각 문자열을 ISO로 정규화한다. 파싱되지 않으면 null.
 *
 * 응답의 다른 시각 필드는 JWT의 숫자 claim에서 만들어지는데 이것만 파일의
 * 문자열이었다. 공개 경로로 파일 내용을 그대로 통과시키지 않도록, 값이 아니라
 * 모양을 강제한다.
 */
function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Date가 표현할 수 있는 최대 시각은 epoch ±8.64e15ms다. 초로 바꾸면 이 값이고,
 * 넘어서면 `toIso`의 `toISOString()`이 RangeError를 던진다.
 *
 * isFinite만으로는 부족하다 — 1e20은 유한하지만 Date로는 표현되지 않는다.
 * 그대로 통과시키면 getAuthStatus가 예외를 던지고, 이 라우트가 약속한
 * `unknown`/503 대신 Nest 기본 필터의 500이 나가 폴러가 원인을 못 읽는다.
 */
const MAX_EPOCH_SECONDS = 8_640_000_000_000;

function isEpochSeconds(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_EPOCH_SECONDS
  );
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
    if (!isEpochSeconds(exp)) return null;
    const iat = claims["iat"];
    return { exp, iat: isEpochSeconds(iat) ? iat : null };
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
  private cliVersion: string | null = null;

  constructor(private readonly configService: ConfigService) {
    this.binaryPath = this.configService.getOrThrow<string>("codex.binaryPath");
  }

  /**
   * `codex --version` 출력. 이미지 수명 동안 바뀌지 않으므로 성공값만 캐시하고,
   * 실패하면 null을 돌려 다음 호출에서 다시 읽는다. 리뷰 재현 조건 기록용이라
   * 실패가 리뷰를 막으면 안 된다.
   */
  async getCliVersion(): Promise<string | null> {
    if (this.cliVersion) return this.cliVersion;
    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        execFile(
          this.binaryPath,
          ["--version"],
          { env: this.buildCodexEnv({}), timeout: CLI_VERSION_TIMEOUT_MS },
          (error, out) => (error ? reject(error) : resolve(String(out))),
        );
      });
      const version = stdout.trim().split("\n")[0]?.trim().slice(0, 64);
      if (!version) return null;
      this.cliVersion = version;
      return version;
    } catch (err) {
      this.logger.error(
        `Failed to read codex CLI version: ${(err as Error).message}`,
      );
      return null;
    }
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
      authMode: ICodexAuthStatus["authMode"] = null,
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

    // 우리가 판정할 수 있는 모드만 되돌려준다. 다른 값이면 status가
    // unsupported_mode로 이미 말하고 있고, 어떤 모드인지까지 공개 경로에 실을
    // 이유는 없다 — auth.json의 임의 문자열을 그대로 내보내는 통로가 된다.
    const authMode =
      doc["auth_mode"] === CHATGPT_AUTH_MODE ? CHATGPT_AUTH_MODE : null;
    const lastRefresh = toIsoOrNull(doc["last_refresh"]);

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

      const publicError =
        result.code === 0 ? null : publicCodexError(result.codexError);
      let rawOutput: string;
      try {
        rawOutput = await readFile(outputFile, "utf-8");
      } catch {
        if (result.code === 0) {
          throw new Error("Codex output file could not be read");
        }
        const detail = publicError ?? result.stderr;
        // The caller prefixes "Codex run failed (exit N):" — don't repeat it.
        rawOutput = detail ? detail.trim() : "Check worker logs for details.";
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
        publicError,
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

function publicCodexError(codexError: string): string | null {
  if (PUBLIC_CODEX_ERRORS.some((re) => re.test(codexError))) {
    return codexError;
  }
  if (USAGE_LIMIT_ERROR.test(codexError)) {
    const resetTime = USAGE_LIMIT_RESET_TIME.exec(codexError)?.[1];
    return resetTime
      ? `You've hit your Codex usage limit. Try again at ${resetTime}.`
      : "You've hit your Codex usage limit.";
  }
  return null;
}
