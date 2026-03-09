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
import { type IReviewItem, type IUnifiedReviewResult } from "./review.types";
import {
  formatInlineComment,
  buildSummaryTable,
  buildVerdictBadge,
  parseUnifiedReviewJson,
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

      // Step 2: Execute unified review (single Codex call)
      const codexResult = await this.executeReview(
        worktreePath,
        data.baseBranch,
      );

      // Step 3: Publish results to Bitbucket
      const commentId = await this.publishResults(data, codexResult);

      // Step 4: Mark completed
      await this.markCompleted(data, codexResult, commentId);
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
  ): Promise<ICodexReviewResult> {
    const prompt = [
      `'${baseBranch}'와 HEAD 사이의 코드 변경사항을 분석하여 한국어로 코드 리뷰해줘.`,
      "",
      "## 출력 형식",
      "",
      "반드시 아래 JSON 객체 형식으로만 응답해줘. 다른 텍스트 없이 JSON만 출력해줘:",
      "```json",
      "{",
      '  "summary": "변경사항 요약 (마크다운 허용). 1) 변경 개요 2) 주요 변경사항 3) 영향 범위를 포함해줘.",',
      '  "verdict": "approve | request-changes | comment",',
      '  "confidence": 85,',
      '  "findings": [',
      "    {",
      '      "path": "src/example/file.ts",',
      '      "line": 42,',
      '      "severity": "blocking",',
      '      "description": "문제가 무엇인지 명확히 설명",',
      '      "problemCode": "문제가 되는 코드 인용 (선택)",',
      '      "suggestedFix": "개선된 코드 예시 (선택)",',
      '      "reason": "왜 이 변경이 필요한지 근거"',
      "    }",
      "  ]",
      "}",
      "```",
      "",
      "## 가이드라인",
      "",
      "### summary",
      "- 변경 개요: 어떤 기능/모듈이 변경되었는지",
      "- 주요 변경사항 목록 (bullet point)",
      "- 영향 범위: 이 변경이 영향을 미치는 부분",
      "- 간결하고 명확하게, 비개발자도 이해할 수 있도록 작성",
      "",
      "### verdict",
      '- "approve": blocking 이슈가 없고, 코드 품질이 양호한 경우',
      '- "request-changes": blocking 이슈가 1개 이상인 경우',
      '- "comment": blocking은 없지만 개선 권장사항이 있는 경우',
      "",
      "### confidence",
      "- 리뷰 판단의 확신도 (0-100)",
      "",
      "### findings",
      "- 각 이슈의 severity는 반드시 다음 4단계 중 하나:",
      '  - "blocking": 반드시 수정 필요 (보안 취약점, 버그, 아키텍처 위반)',
      '  - "recommended": 권장 개선 사항 (성능, 가독성, 베스트 프랙티스)',
      '  - "suggestion": 선택적 개선 아이디어 (리팩토링, 최적화 기회)',
      '  - "tech-debt": 향후 개선이 필요한 기술 부채',
      "- 문제가 없으면 빈 배열 []",
    ].join("\n");

    const result = await this.codexService.executeCodex(
      worktreePath,
      baseBranch,
      prompt,
    );

    if (result.exitCode !== 0) {
      throw new Error(
        `Codex run failed (exit ${result.exitCode}): ${result.rawOutput.substring(0, 500)}`,
      );
    }

    return result;
  }

  /** Step 3: Bitbucket에 결과 게시 */
  private async publishResults(
    data: IReviewJobData,
    codexResult: ICodexReviewResult,
  ): Promise<number | undefined> {
    await this.reviewService.updateStatus(
      data.reviewRunId,
      ReviewRunStatus.PUBLISHING,
    );

    const unified = parseUnifiedReviewJson(codexResult.rawOutput, (msg) =>
      this.logger.error(msg),
    );

    if (unified) {
      return this.publishUnifiedResults(data, unified);
    }

    return this.publishFallbackResults(data, codexResult.rawOutput);
  }

  /** 통합 파싱 성공 시: verdict badge + summary + stats table + inline comments */
  private async publishUnifiedResults(
    data: IReviewJobData,
    unified: IUnifiedReviewResult,
  ): Promise<number | undefined> {
    // Build summary comment body
    const verdictBadge = buildVerdictBadge(unified.verdict, unified.confidence);
    const statsTable =
      unified.findings.length > 0
        ? buildSummaryTable(unified.findings)
        : "";
    const summaryBody = [
      `## 📋 코드 리뷰`,
      "",
      verdictBadge,
      "",
      unified.summary,
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
    if (unified.findings.length > 0) {
      await this.postInlineComments(data, unified.findings);
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

  /** Step 4: 완료 상태 저장 */
  private async markCompleted(
    data: IReviewJobData,
    codexResult: ICodexReviewResult,
    commentId: number | undefined,
  ): Promise<void> {
    await this.reviewService.updateStatus(
      data.reviewRunId,
      ReviewRunStatus.COMPLETED,
      {
        reviewOutput: codexResult.rawOutput,
        resultCommentId: commentId!,
        durationMs: codexResult.durationMs,
      },
    );

    this.logger.log(
      `Review completed: PR #${data.pullRequestId}, comment=${commentId}, ${codexResult.durationMs}ms`,
    );
  }
}
