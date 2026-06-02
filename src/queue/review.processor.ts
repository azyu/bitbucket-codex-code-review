import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { ConfigService } from "@nestjs/config";
import { ServiceLogger } from "@lib/logger";
import { REVIEW_QUEUE_NAME } from "../constants/queue.constants";
import { IReviewJobData } from "./interfaces/queue.interfaces";
import { ReviewRunStatus } from "../entities/review-run.entity";
import { ReviewService } from "../review/review.service";
import { WorkspaceService } from "../workspace/workspace.service";
import { CodexService } from "../codex/codex.service";
import { ICodexReviewResult } from "../codex/interfaces/codex.interfaces";
import { BitbucketService } from "../bitbucket/bitbucket.service";
import { type IReviewItem, type IUnifiedReviewResult } from "./review.types";
import {
  formatInlineComment,
  buildSummaryTable,
  buildVerdictBadge,
  normalizeSummaryMarkdown,
  parseUnifiedReviewJson,
} from "./review.formatter";
import { resolveReviewPrompt } from "./review.prompt";

@Processor(REVIEW_QUEUE_NAME)
export class ReviewProcessor extends WorkerHost {
  private readonly logger = new ServiceLogger(ReviewProcessor.name);

  constructor(
    private readonly reviewService: ReviewService,
    private readonly workspaceService: WorkspaceService,
    private readonly codexService: CodexService,
    private readonly bitbucketService: BitbucketService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  override async process(job: Job<IReviewJobData>): Promise<void> {
    const data = job.data;
    const processStartTime = Date.now();
    this.logger.log(`Processing review job: ${data.idempotencyKey}`);

    let worktreePath: string | undefined;
    let bareRepoPath: string | undefined;
    let codexResult: ICodexReviewResult | undefined;
    let reviewDiff = "";

    try {
      // Step 1: Prepare workspace
      const worktreeInfo = await this.prepareWorkspace(data);
      worktreePath = worktreeInfo.worktreePath;
      bareRepoPath = worktreeInfo.bareRepoPath;
      reviewDiff = await this.workspaceService.createReviewDiff(
        worktreePath,
        data.baseBranch,
      );

      // Step 2: Execute unified review (single Codex call)
      codexResult = await this.executeReview(
        worktreePath,
        data.baseBranch,
        reviewDiff,
      );

      // Step 3: Publish results to Bitbucket
      const commentId = await this.publishResults(data, codexResult, reviewDiff);

      // Step 4: Mark completed
      await this.markCompleted(
        data,
        codexResult,
        commentId,
        Date.now() - processStartTime,
      );
    } catch (err) {
      const error = err as Error;
      const failedCodexResult =
        codexResult ||
        (err as Error & { codexResult?: ICodexReviewResult }).codexResult;
      this.logger.error(`Review failed: ${error.message}`);

      await this.reviewService.updateStatus(
        data.reviewRunId,
        ReviewRunStatus.FAILED,
        {
          reviewOutput: failedCodexResult?.rawOutput,
          durationMs: failedCodexResult?.durationMs,
          totalDurationMs: Date.now() - processStartTime,
          inputTokens: failedCodexResult?.inputTokens ?? undefined,
          cachedInputTokens:
            failedCodexResult?.cachedInputTokens ?? undefined,
          outputTokens: failedCodexResult?.outputTokens ?? undefined,
          errorMessage: error.message.substring(0, 2000),
        },
      );

      // Notify user about the failure
      const errorBody = `❌ Code Review 실패\n\n\`\`\`\n${error.message.substring(0, 500)}\n\`\`\``;
      if (data.triggerCommentId) {
        this.bitbucketService
          .replyToComment({
            workspace: data.workspaceSlug,
            repoSlug: data.repositorySlug,
            pullRequestId: data.pullRequestId,
            parentCommentId: data.triggerCommentId,
            body: errorBody,
          })
          .catch((replyErr) => {
            this.logger.error(
              `Failed to post error reply: ${(replyErr as Error).message}`,
            );
          });
      } else {
        this.bitbucketService
          .createComment({
            workspace: data.workspaceSlug,
            repoSlug: data.repositorySlug,
            pullRequestId: data.pullRequestId,
            body: errorBody,
          })
          .catch((commentErr) => {
            this.logger.error(
              `Failed to post error comment: ${(commentErr as Error).message}`,
            );
          });
      }

      throw err; // Re-throw to let BullMQ handle retry
    } finally {
      // Cleanup worktree
      if (worktreePath && bareRepoPath) {
        await this.workspaceService
          .cleanupWorktree(worktreePath, bareRepoPath)
          .catch((err) => {
            this.logger.error(`Cleanup failed: ${(err as Error).message}`);
          });
      }
    }
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job<IReviewJobData>, error: Error): void {
    this.logger.error(
      `Job ${job.id} failed permanently after ${job.attemptsMade} attempts: ${error.message}`,
    );
  }

  /** Step 1: 워크스페이스 준비 */
  private async prepareWorkspace(
    data: IReviewJobData,
  ): Promise<{ worktreePath: string; bareRepoPath: string }> {
    await this.reviewService.updateStatus(
      data.reviewRunId,
      ReviewRunStatus.PREPARING,
    );
    return this.workspaceService.prepareWorktree({
      cloneUrl: data.cloneUrl,
      repositorySlug: data.repositorySlug,
      headBranch: data.headBranch,
      baseBranch: data.baseBranch,
      headCommitHash: data.headCommitHash,
    });
  }

  /** Step 2: 통합 프롬프트로 단일 Codex 호출 */
  private async executeReview(
    worktreePath: string,
    baseBranch: string,
    reviewDiff: string,
  ): Promise<ICodexReviewResult> {
    const customPromptFilepath = this.configService.get<string>(
      "codex.customPromptFilepath",
      "",
    );
    const prompt = await resolveReviewPrompt(
      baseBranch,
      customPromptFilepath,
      reviewDiff,
    );

    const result = await this.codexService.executeCodex(
      worktreePath,
      baseBranch,
      prompt,
    );

    if (result.exitCode !== 0) {
      const error = new Error(
        `Codex run failed (exit ${result.exitCode}): ${result.rawOutput.substring(0, 500)}`,
      );
      (
        error as Error & {
          codexResult?: ICodexReviewResult;
        }
      ).codexResult = result;
      throw error;
    }

    return result;
  }

  /** Step 3: Bitbucket에 결과 게시 */
  private async publishResults(
    data: IReviewJobData,
    codexResult: ICodexReviewResult,
    reviewDiff: string,
  ): Promise<number | undefined> {
    await this.reviewService.updateStatus(
      data.reviewRunId,
      ReviewRunStatus.PUBLISHING,
    );

    const unified = parseUnifiedReviewJson(codexResult.rawOutput, (msg) =>
      this.logger.error(msg),
    );

    if (unified) {
      return this.publishUnifiedResults(data, unified, reviewDiff);
    }

    return this.publishFallbackResults(data, codexResult.rawOutput);
  }

  /** 통합 파싱 성공 시: verdict badge + summary + stats table + inline comments */
  private async publishUnifiedResults(
    data: IReviewJobData,
    unified: IUnifiedReviewResult,
    reviewDiff = "",
  ): Promise<number | undefined> {
    const findings = this.filterFindingsToReviewDiff(
      unified.findings,
      reviewDiff,
    );
    const verdict =
      unified.verdict === "request-changes" &&
      !findings.some((item) => item.severity === "blocking")
        ? findings.length > 0
          ? "comment"
          : "approve"
        : unified.verdict;

    // Build summary comment body
    const verdictBadge = buildVerdictBadge(verdict, unified.confidence);
    const statsTable =
      findings.length > 0
        ? buildSummaryTable(findings)
        : "";
    const normalizedSummary = normalizeSummaryMarkdown(unified.summary);
    const summaryBody = [
      `## 📋 코드 리뷰`,
      "",
      verdictBadge,
      "",
      normalizedSummary,
      statsTable,
    ]
      .filter(Boolean)
      .join("\n\n");

    const summaryComment = await this.bitbucketService.createComment({
      workspace: data.workspaceSlug,
      repoSlug: data.repositorySlug,
      pullRequestId: data.pullRequestId,
      body: summaryBody,
    });
    this.logger.log(`Summary comment posted: ${summaryComment.id}`);

    // Post inline comments
    if (findings.length > 0) {
      await this.postInlineComments(data, findings);
    }

    return summaryComment.id;
  }

  /** 파싱 실패 시: raw output 일반 댓글 게시 */
  private async publishFallbackResults(
    data: IReviewJobData,
    rawOutput: string,
  ): Promise<number | undefined> {
    this.logger.warn("Unified JSON parse failed, falling back to raw output comment");
    const comment = await this.bitbucketService.createComment({
      workspace: data.workspaceSlug,
      repoSlug: data.repositorySlug,
      pullRequestId: data.pullRequestId,
      body: `## 🔍 코드 리뷰\n\n${rawOutput}`,
    });
    this.logger.log(`Fallback comment posted: ${comment.id}`);
    return comment.id;
  }

  /** inline comments 개별 게시 (전체 실패 시 일반 댓글 fallback) */
  private async postInlineComments(
    data: IReviewJobData,
    findings: ReadonlyArray<IReviewItem>,
  ): Promise<void> {
    let postedCount = 0;
    for (const item of findings) {
      try {
        const body = formatInlineComment(item);
        await this.bitbucketService.createInlineComment({
          workspace: data.workspaceSlug,
          repoSlug: data.repositorySlug,
          pullRequestId: data.pullRequestId,
          filePath: item.path,
          line: item.lineRange.end,
          body,
        });
        postedCount++;
      } catch (err) {
        this.logger.warn(
          `Inline comment failed for ${item.path}:${item.lineRange.end}: ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `Inline comments posted: ${postedCount}/${findings.length}`,
    );

    // If all inline comments failed, fallback to general comment
    if (postedCount === 0) {
      this.logger.warn("All inline comments failed, falling back to general comment");
      const fallbackBody = findings
        .map((f) => formatInlineComment(f))
        .join("\n\n---\n\n");
      await this.bitbucketService.createComment({
        workspace: data.workspaceSlug,
        repoSlug: data.repositorySlug,
        pullRequestId: data.pullRequestId,
        body: `## 🔍 코드 리뷰 상세\n\n${fallbackBody}`,
      });
    }
  }

  private filterFindingsToReviewDiff(
    findings: ReadonlyArray<IReviewItem>,
    reviewDiff: string,
  ): ReadonlyArray<IReviewItem> {
    const changedPaths = this.extractChangedPathsFromDiff(reviewDiff);
    if (changedPaths.size === 0) {
      if (findings.length > 0) {
        this.logger.warn("Dropping all findings because review diff has no changed paths");
      }
      return [];
    }

    const filtered = findings.filter((item) => changedPaths.has(item.path));
    const droppedCount = findings.length - filtered.length;
    if (droppedCount > 0) {
      this.logger.warn(
        `Dropped ${droppedCount} findings outside reviewed diff paths`,
      );
    }
    return filtered;
  }

  private extractChangedPathsFromDiff(reviewDiff: string): ReadonlySet<string> {
    const paths = new Set<string>();
    for (const line of reviewDiff.split("\n")) {
      if (!line.startsWith("diff --git ")) continue;

      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      if (!match) continue;

      paths.add(match[2]);
    }
    return paths;
  }

  /** Step 4: 완료 상태 저장 */
  private async markCompleted(
    data: IReviewJobData,
    codexResult: ICodexReviewResult,
    commentId: number | undefined,
    totalDurationMs: number,
  ): Promise<void> {
    await this.reviewService.updateStatus(
      data.reviewRunId,
      ReviewRunStatus.COMPLETED,
      {
        reviewOutput: codexResult.rawOutput,
        resultCommentId: commentId!,
        durationMs: codexResult.durationMs,
        totalDurationMs,
        inputTokens: codexResult.inputTokens ?? undefined,
        cachedInputTokens: codexResult.cachedInputTokens ?? undefined,
        outputTokens: codexResult.outputTokens ?? undefined,
      },
    );

    this.logger.log(
      `Review completed: PR #${data.pullRequestId}, comment=${commentId}, ${codexResult.durationMs}ms`,
    );
  }
}
