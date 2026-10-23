import { setTimeout as sleep } from "node:timers/promises";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ServiceLogger } from "@lib/logger";
import {
  IBitbucketComment,
  ICreateCommentParams,
  ICreateInlineCommentParams,
} from "./interfaces/bitbucket.interfaces";
import { IBitbucketCredentialSnapshot } from "../settings/runtime-settings.types";

const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUSES = new Set([429, 503]);
const DEFAULT_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 10_000;

/** Retry-After to ms. Delta-seconds is checked first: Date.parse("2") is the year 2001. */
function parseRetryAfterMs(value: string | null): number {
  if (value === null) return DEFAULT_RETRY_DELAY_MS;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date)
    ? DEFAULT_RETRY_DELAY_MS
    : Math.max(0, date - Date.now());
}

@Injectable()
export class BitbucketService {
  private readonly logger = new ServiceLogger(BitbucketService.name);
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      "bitbucket.baseUrl",
      "https://api.bitbucket.org/2.0",
    );
  }

  /** Auth order: repository token, global token, then legacy Basic credentials. */
  private resolveAuthHeaders(
    repoSlug: string,
    credentials: IBitbucketCredentialSnapshot,
  ): readonly string[] {
    const authHeaders = credentials.apiTokens.map((token) => `Bearer ${token}`);
    if (credentials.username && credentials.appPassword) {
      authHeaders.push(
        `Basic ${Buffer.from(`${credentials.username}:${credentials.appPassword}`).toString("base64")}`,
      );
    }
    if (authHeaders.length === 0) {
      this.logger.warn(
        `No Bitbucket auth configured for repo "${repoSlug}" — API calls will fail`,
      );
      authHeaders.push(`Basic ${Buffer.from(":").toString("base64")}`);
    }
    return authHeaders;
  }

  private async postWithAuthFallback(
    url: string,
    repoSlug: string,
    body: string,
    credentials: IBitbucketCredentialSnapshot,
  ): Promise<Response> {
    const authHeaders = this.resolveAuthHeaders(repoSlug, credentials);
    for (const [index, authHeader] of authHeaders.entries()) {
      const response = await this.sendWithRateLimitRetry(
        url,
        authHeader,
        body,
        repoSlug,
      );
      if (response.status !== 401 || index === authHeaders.length - 1) {
        return response;
      }
      this.logger.warn(
        `Repository token rejected for "${repoSlug}"; retrying with global Bitbucket credentials`,
      );
    }
    throw new Error("Bitbucket auth resolution produced no credentials");
  }

  /**
   * Retries 429/503 only: Bitbucket rejects those before processing the write. A proxy 503
   * after the upstream received the request may mean it landed; that duplicate risk is accepted.
   * A Retry-After above the cap is a quota window, so the response is returned as-is.
   */
  private async sendWithRateLimitRetry(
    url: string,
    authHeader: string,
    body: string,
    repoSlug: string,
  ): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body,
      });
      if (!RETRYABLE_STATUSES.has(response.status) || attempt >= MAX_ATTEMPTS) {
        return response;
      }
      const delayMs = parseRetryAfterMs(response.headers.get("retry-after"));
      if (delayMs > MAX_RETRY_DELAY_MS) {
        return response;
      }
      await response.body?.cancel();
      this.logger.warn(
        `Bitbucket returned ${response.status} for "${repoSlug}"; retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_ATTEMPTS})`,
      );
      await this.wait(delayMs);
    }
  }

  private async wait(ms: number): Promise<void> {
    await sleep(ms);
  }

  /** PR에 리뷰 결과 댓글 생성 */
  async createComment(
    params: ICreateCommentParams,
    credentials: IBitbucketCredentialSnapshot,
  ): Promise<IBitbucketComment> {
    const url = `${this.baseUrl}/repositories/${params.workspace}/${params.repoSlug}/pullrequests/${params.pullRequestId}/comments`;

    const response = await this.postWithAuthFallback(
      url,
      params.repoSlug,
      JSON.stringify({
        content: { raw: params.body },
      }),
      credentials,
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Bitbucket API error ${response.status}: ${errorBody}`);
    }

    const result = (await response.json()) as IBitbucketComment;
    this.logger.log(
      `Comment created: ${result.id} on PR #${params.pullRequestId}`,
    );
    return result;
  }

  /** 특정 댓글에 답글 달기 */
  async replyToComment(
    params: ICreateCommentParams & { parentCommentId: number },
    credentials: IBitbucketCredentialSnapshot,
  ): Promise<IBitbucketComment> {
    const url = `${this.baseUrl}/repositories/${params.workspace}/${params.repoSlug}/pullrequests/${params.pullRequestId}/comments`;

    const response = await this.postWithAuthFallback(
      url,
      params.repoSlug,
      JSON.stringify({
        content: { raw: params.body },
        parent: { id: params.parentCommentId },
      }),
      credentials,
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Bitbucket API error ${response.status}: ${errorBody}`);
    }

    return (await response.json()) as IBitbucketComment;
  }

  /** PR의 특정 파일/라인에 inline 댓글 생성 */
  async createInlineComment(
    params: ICreateInlineCommentParams,
    credentials: IBitbucketCredentialSnapshot,
  ): Promise<IBitbucketComment> {
    const url = `${this.baseUrl}/repositories/${params.workspace}/${params.repoSlug}/pullrequests/${params.pullRequestId}/comments`;

    const response = await this.postWithAuthFallback(
      url,
      params.repoSlug,
      JSON.stringify({
        content: { raw: params.body },
        inline: {
          path: params.filePath,
          to: params.line,
        },
      }),
      credentials,
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Bitbucket inline comment API error ${response.status}: ${errorBody}`,
      );
    }

    const result = (await response.json()) as IBitbucketComment;
    this.logger.log(
      `Inline comment created: ${result.id} on ${params.filePath}:${params.line}`,
    );
    return result;
  }
}
