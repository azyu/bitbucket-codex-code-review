import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ServiceLogger } from "@lib/logger";
import {
  IBitbucketComment,
  ICreateCommentParams,
  ICreateInlineCommentParams,
} from "./interfaces/bitbucket.interfaces";

@Injectable()
export class BitbucketService {
  private readonly logger = new ServiceLogger(BitbucketService.name);
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      "bitbucket.baseUrl",
      "https://api.bitbucket.org/2.0",
    );
    const apiToken = this.configService.get<string>("bitbucket.apiToken", "");
    if (apiToken) {
      this.authHeader = `Bearer ${apiToken}`;
    } else {
      const username = this.configService.get<string>(
        "bitbucket.username",
        "",
      );
      const appPassword = this.configService.get<string>(
        "bitbucket.appPassword",
        "",
      );
      if (!username || !appPassword) {
        this.logger.warn(
          "No Bitbucket auth configured — API calls will fail for private resources",
        );
      }
      this.authHeader = `Basic ${Buffer.from(`${username}:${appPassword}`).toString("base64")}`;
    }
  }

  /** PR에 리뷰 결과 댓글 생성 */
  async createComment(
    params: ICreateCommentParams,
  ): Promise<IBitbucketComment> {
    const url = `${this.baseUrl}/repositories/${params.workspace}/${params.repoSlug}/pullrequests/${params.pullRequestId}/comments`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: { raw: params.body },
      }),
    });

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
  ): Promise<IBitbucketComment> {
    const url = `${this.baseUrl}/repositories/${params.workspace}/${params.repoSlug}/pullrequests/${params.pullRequestId}/comments`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: { raw: params.body },
        parent: { id: params.parentCommentId },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Bitbucket API error ${response.status}: ${errorBody}`);
    }

    return (await response.json()) as IBitbucketComment;
  }

  /** PR의 특정 파일/라인에 inline 댓글 생성 */
  async createInlineComment(
    params: ICreateInlineCommentParams,
  ): Promise<IBitbucketComment> {
    const url = `${this.baseUrl}/repositories/${params.workspace}/${params.repoSlug}/pullrequests/${params.pullRequestId}/comments`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: { raw: params.body },
        inline: {
          path: params.filePath,
          ...(params.endLine ? { from: params.line } : {}),
          to: params.endLine ?? params.line,
        },
      }),
    });

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
