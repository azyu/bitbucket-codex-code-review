import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { ServiceLogger } from "@lib/logger";
import { REVIEW_QUEUE_NAME } from "../constants/queue.constants";
import { IReviewJobData } from "./interfaces/queue.interfaces";
import { ReviewRunStatus } from "../entities/review-run.entity";
import { ReviewService } from "../review/review.service";
import { WorkspaceService } from "../workspace/workspace.service";
import { CodexService } from "../codex/codex.service";
import { ICodexReviewResult } from "../codex/interfaces/codex.interfaces";
import { BitbucketService } from "../bitbucket/bitbucket.service";
import { type IReviewItem } from "./review.types";
import {
  formatInlineComment,
  buildSummaryTable,
  parseReviewJson,
} from "./review.formatter";

@Processor(REVIEW_QUEUE_NAME)
export class ReviewProcessor extends WorkerHost {
  private readonly logger = new ServiceLogger(ReviewProcessor.name);

  constructor(
    private readonly reviewService: ReviewService,
    private readonly workspaceService: WorkspaceService,
    private readonly codexService: CodexService,
    private readonly bitbucketService: BitbucketService,
  ) {
    super();
  }

  override async process(job: Job<IReviewJobData>): Promise<void> {
    const data = job.data;
    this.logger.log(`Processing review job: ${data.idempotencyKey}`);

    let worktreePath: string | undefined;
    let bareRepoPath: string | undefined;

    try {
      // Step 1: Prepare workspace
      const worktreeInfo = await this.prepareWorkspace(data);
      worktreePath = worktreeInfo.worktreePath;
      bareRepoPath = worktreeInfo.bareRepoPath;

      // Step 2: Execute summary + detailed review in parallel
      const { summaryResult, reviewResult } = await this.executeReviews(
        worktreePath,
        data.baseBranch,
      );

      // Step 3: Publish results to Bitbucket
      const { summaryCommentId, reviewCommentId } =
        await this.publishResults(data, summaryResult, reviewResult);

      // Step 4: Mark completed
      await this.markCompleted(
        data,
        summaryResult,
        reviewResult,
        summaryCommentId,
        reviewCommentId,
      );
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Review failed: ${error.message}`);

      await this.reviewService.updateStatus(
        data.reviewRunId,
        ReviewRunStatus.FAILED,
        {
          errorMessage: error.message.substring(0, 2000),
        },
      );

      // Notify user on the original @codex comment
      if (data.triggerCommentId) {
        this.bitbucketService
          .replyToComment({
            workspace: data.workspaceSlug,
            repoSlug: data.repositorySlug,
            pullRequestId: data.pullRequestId,
            parentCommentId: data.triggerCommentId,
            body: `❌ Code Review 실패\n\n\`\`\`\n${error.message.substring(0, 500)}\n\`\`\``,
          })
          .catch((replyErr) => {
            this.logger.error(
              `Failed to post error reply: ${(replyErr as Error).message}`,
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

  /** Step 2: summary + detailed review 병렬 실행 */
  private async executeReviews(
    worktreePath: string,
    baseBranch: string,
  ): Promise<{
    summaryResult: ICodexReviewResult;
    reviewResult: ICodexReviewResult;
  }> {
    const summaryPrompt = [
      `'${baseBranch}'와 HEAD 사이의 코드 변경사항을 분석하여 한국어로 요약해줘.`,
      "다음 형식으로 작성해줘:",
      "1. 변경 개요 (어떤 기능/모듈이 변경되었는지)",
      "2. 주요 변경사항 목록 (bullet point)",
      "3. 영향 범위 (이 변경이 영향을 미치는 부분)",
      "간결하고 명확하게, 비개발자도 이해할 수 있도록 작성해줘.",
    ].join("\n");

    const reviewPrompt = [
      `'${baseBranch}'와 HEAD 사이의 코드 변경사항을 한국어로 상세 코드 리뷰해줘.`,
      "다음 관점에서 리뷰해줘:",
      "- 버그 및 잠재적 오류",
      "- 보안 이슈",
      "- 성능 개선점",
      "- 코드 구조 및 설계",
      "- 개선 제안",
      "",
      "각 이슈의 심각도(severity)는 반드시 다음 4단계 중 하나로 분류해줘:",
      '- "blocking": 반드시 수정이 필요한 항목 (보안 취약점, 버그, 아키텍처 위반)',
      '- "recommended": 권장 개선 사항 (성능, 가독성, 베스트 프랙티스)',
      '- "suggestion": 선택적 개선 아이디어 (리팩토링, 최적화 기회)',
      '- "tech-debt": 향후 개선이 필요한 기술 부채',
      "",
      "반드시 아래 JSON 배열 형식으로만 응답해줘. 다른 텍스트 없이 JSON만 출력해줘:",
      "```json",
      "[",
      "  {",
      '    "path": "src/example/file.ts",',
      '    "line": 42,',
      '    "severity": "blocking",',
      '    "description": "문제가 무엇인지 명확히 설명",',
      '    "problemCode": "문제가 되는 코드 인용 (선택)",',
      '    "suggestedFix": "개선된 코드 예시 (선택)",',
      '    "reason": "왜 이 변경이 필요한지 근거"',
      "  }",
      "]",
      "```",
      "",
      "문제가 없으면 빈 배열 []을 반환해줘.",
    ].join("\n");

    const [summaryResult, reviewResult] = await Promise.all([
      this.codexService.executeCodex(worktreePath, baseBranch, summaryPrompt),
      this.codexService.executeCodex(worktreePath, baseBranch, reviewPrompt),
    ]);

    if (summaryResult.exitCode !== 0 && reviewResult.exitCode !== 0) {
      throw new Error(
        `Both codex runs failed. Summary: ${summaryResult.rawOutput.substring(0, 250)}. Review: ${reviewResult.rawOutput.substring(0, 250)}`,
      );
    }

    return { summaryResult, reviewResult };
  }

  /** Step 3: Bitbucket에 결과 게시 */
  private async publishResults(
    data: IReviewJobData,
    summaryResult: ICodexReviewResult,
    reviewResult: ICodexReviewResult,
  ): Promise<{
    summaryCommentId: number | undefined;
    reviewCommentId: number | undefined;
  }> {
    await this.reviewService.updateStatus(
      data.reviewRunId,
      ReviewRunStatus.PUBLISHING,
    );

    let summaryCommentId: number | undefined;
    let reviewCommentId: number | undefined;

    // Parse review items first (needed for summary table)
    const inlineItems: ReadonlyArray<IReviewItem> =
      reviewResult.exitCode === 0
        ? parseReviewJson(reviewResult.rawOutput, (msg) =>
            this.logger.error(msg),
          )
        : [];

    // Post summary comment with review stats table (if succeeded)
    if (summaryResult.exitCode === 0) {
      const statsTable =
        inlineItems.length > 0 ? buildSummaryTable(inlineItems) : "";
      const summaryBody = [
        `## 📋 변경사항 요약`,
        "",
        summaryResult.rawOutput,
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
      summaryCommentId = summaryComment.id;
      this.logger.log(`Summary comment posted: ${summaryComment.id}`);
    } else {
      this.logger.warn(`Summary failed (exit ${summaryResult.exitCode}), skipping`);
    }

    // Post review: try inline comments, fallback to general comment
    if (reviewResult.exitCode === 0) {
      if (inlineItems.length > 0) {
        // Post inline comments per file/line
        let postedCount = 0;
        for (const item of inlineItems) {
          try {
            const body = formatInlineComment(item);
            await this.bitbucketService.createInlineComment({
              workspace: data.workspaceSlug,
              repoSlug: data.repositorySlug,
              pullRequestId: data.pullRequestId,
              filePath: item.path,
              line: item.line,
              body,
            });
            postedCount++;
          } catch (err) {
            this.logger.warn(
              `Inline comment failed for ${item.path}:${item.line}: ${(err as Error).message}`,
            );
          }
        }
        this.logger.log(
          `Inline comments posted: ${postedCount}/${inlineItems.length}`,
        );

        // If all inline comments failed, fallback to general comment
        if (postedCount === 0) {
          this.logger.warn("All inline comments failed, falling back to general comment");
          const reviewComment = await this.bitbucketService.createComment({
            workspace: data.workspaceSlug,
            repoSlug: data.repositorySlug,
            pullRequestId: data.pullRequestId,
            body: `## 🔍 코드 리뷰\n\n${reviewResult.rawOutput}`,
          });
          reviewCommentId = reviewComment.id;
        } else {
          // Use first inline comment as reference
          reviewCommentId = -1; // inline comments have no single ID
        }
      } else {
        // JSON parse failed or empty → fallback to general comment
        const reviewBody = `## 🔍 코드 리뷰\n\n${reviewResult.rawOutput}`;
        const reviewComment = await this.bitbucketService.createComment({
          workspace: data.workspaceSlug,
          repoSlug: data.repositorySlug,
          pullRequestId: data.pullRequestId,
          body: reviewBody,
        });
        reviewCommentId = reviewComment.id;
        this.logger.log(`Review comment posted (fallback): ${reviewComment.id}`);
      }
    } else {
      this.logger.warn(`Review failed (exit ${reviewResult.exitCode}), skipping`);
    }

    if (!summaryCommentId && !reviewCommentId) {
      throw new Error("Both comments failed to post");
    }

    return { summaryCommentId, reviewCommentId };
  }

  /** Step 4: 완료 상태 저장 */
  private async markCompleted(
    data: IReviewJobData,
    summaryResult: ICodexReviewResult,
    reviewResult: ICodexReviewResult,
    summaryCommentId: number | undefined,
    reviewCommentId: number | undefined,
  ): Promise<void> {
    const totalDurationMs = Math.max(summaryResult.durationMs, reviewResult.durationMs);
    const combinedOutput = [
      summaryResult.exitCode === 0 ? `## Summary\n${summaryResult.rawOutput}` : "",
      reviewResult.exitCode === 0 ? `## Review\n${reviewResult.rawOutput}` : "",
    ].filter(Boolean).join("\n\n---\n\n");

    await this.reviewService.updateStatus(
      data.reviewRunId,
      ReviewRunStatus.COMPLETED,
      {
        reviewOutput: combinedOutput,
        resultCommentId: reviewCommentId ?? summaryCommentId!,
        durationMs: totalDurationMs,
      },
    );

    this.logger.log(
      `Review completed: PR #${data.pullRequestId}, summary=${summaryCommentId}, review=${reviewCommentId}, ${totalDurationMs}ms`,
    );
  }
}
