import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Job, UnrecoverableError } from "bullmq";
import { ConfigService } from "@nestjs/config";
import { metrics } from "@opentelemetry/api";
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
import { type ReviewPromptMode, resolveReviewPrompt } from "./review.prompt";

// Codex turn/start currently rejects input above 1,048,576 chars.
// Keep margin for base instructions, custom prompt text, and JSON schema.
const MAX_INLINE_REVIEW_PROMPT_CHARS = 900_000;

type ResultCommentPublishedCallback = (commentId: number) => Promise<void>;

function authenticationFailureStage(error: Error): "api" | "git" | null {
  if (/Bitbucket(?: inline comment)? API error 401\b/.test(error.message)) {
    return "api";
  }
  if (/\bfatal: Authentication failed\b/i.test(error.message)) {
    return "git";
  }
  return null;
}

@Processor(REVIEW_QUEUE_NAME)
export class ReviewProcessor extends WorkerHost {
  private readonly logger = new ServiceLogger(ReviewProcessor.name);
  private readonly authenticationFailureCounter = metrics
    .getMeter("code-review")
    .createCounter("code_review_authentication_failures", {
      description: "Permanent Bitbucket authentication failures",
    });

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
    let publishStarted = false;
    let resultCommentId: number | undefined;

    try {
      // 이 런이 아직 활성인지 DB가 판정한다. 조건에 맞는 행이 없으면(대체됨/삭제됨)
      // 구버전 커밋 리뷰가 시작조차 하지 않는다. worktreePath 할당 전에 빠져나가야
      // finally 정리가 no-op이 되므로 판정은 반드시 이 위치여야 한다.
      // 클레임 자체가 실패하면(DB 장애) 아래 catch가 재시도/최종 보고를 판단한다.
      if (
        !(await this.reviewService.claimStatus(
          data.reviewRunId,
          ReviewRunStatus.PREPARING,
        ))
      ) {
        await this.logInactiveRun(data);
        return;
      }

      // Step 1: Prepare workspace
      const worktreeInfo = await this.workspaceService.prepareWorktree({
        cloneUrl: data.cloneUrl,
        repositorySlug: data.repositorySlug,
        headBranch: data.headBranch,
        baseBranch: data.baseBranch,
        headCommitHash: data.headCommitHash,
      });
      worktreePath = worktreeInfo.worktreePath;
      bareRepoPath = worktreeInfo.bareRepoPath;
      const { diff, excludedChangedFiles } =
        await this.workspaceService.createReviewDiff(
          worktreePath,
          data.baseBranch,
        );
      reviewDiff = diff;

      // Step 2: Execute unified review (single Codex call)
      codexResult = await this.executeReview(
        worktreePath,
        data.baseBranch,
        reviewDiff,
        data.repositorySlug,
        excludedChangedFiles,
      );

      // Step 3: Publish results to Bitbucket
      // 게시 권한을 DB에서 획득한다 — Codex 실행(수 분) 중에 대체됐으면 여기서 멈춘다.
      // 이 클레임이 이 런의 되돌릴 수 없는 지점이다: UPDATE가 커밋된 뒤 응답만 유실되면
      // (커넥션 리셋·타임아웃·풀 종료) 행은 publishing이 되고 그 상태는
      // CLAIMABLE_BEFORE_PUBLISH 밖이므로 어떤 재시도도 다시 클레임하지 못한다.
      // 즉 "DB 전이까지는 재시도해도 안전"하지 않다 — 그 대가로 중복 게시를 막는다.
      if (
        !(await this.reviewService.claimStatus(
          data.reviewRunId,
          ReviewRunStatus.PUBLISHING,
        ))
      ) {
        // 여기서 FAILED를 쓰면 existsByIdempotencyKey가 미게시 실패로 판단해 행을 삭제하고
        // 같은 요청을 다시 받아들인다 — 막으려던 중복 게시를 되살리는 셈이다. 로그만 남긴다.
        this.logger.log(
          `Skipping publish for inactive review run ${data.reviewRunId}: ${data.idempotencyKey}`,
        );
        return;
      }
      publishStarted = true;
      const commentId = await this.publishResults(
        data,
        codexResult,
        reviewDiff,
        async (publishedCommentId) => {
          // 로컬 증거를 먼저 남겨 DB 저장 실패도 catch에서 보존한다.
          resultCommentId = publishedCommentId;
          try {
            await this.reviewService.updateResultCommentId(
              data.reviewRunId,
              publishedCommentId,
            );
          } catch (persistenceErr) {
            this.logger.error(
              `Failed to persist result comment ID: ${(persistenceErr as Error).message}`,
            );
          }
        },
      );

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
      const authFailureStage = authenticationFailureStage(error);
      if (authFailureStage) {
        this.authenticationFailureCounter.add(1, {
          repository: data.repositorySlug,
          stage: authFailureStage,
        });
      }

      // 게시 전 일시 실패이고 시도가 남았으면 FAILED 기록·실패 코멘트를 보류한다.
      // 인증 실패는 재시도로 복구되지 않으므로 첫 시도에 바로 기록하고 중단한다.
      if (
        !publishStarted &&
        !authFailureStage &&
        job.attemptsMade + 1 < (job.opts?.attempts ?? 1)
      ) {
        throw err;
      }

      // 상태 기록 실패가 재시도 여부를 뒤집으면 안 된다 — 던지면 아래 UnrecoverableError
      // 분기에 도달하지 못해 게시 이후 실패가 재시도되고 리뷰가 중복 게시된다.
      // DB 장애로 판정 자체가 실패하면 이전처럼 알린다 — 침묵보다 낫다.
      // DB가 "이 런은 더 이상 활성이 아니다"라고 확정한 경우에만 알림을 건너뛴다.
      let failureClaimed = true;
      try {
        failureClaimed = await this.reviewService.claimFailure(
          data.reviewRunId,
          {
            reviewOutput: failedCodexResult?.rawOutput,
            resultCommentId,
            durationMs: failedCodexResult?.durationMs,
            totalDurationMs: Date.now() - processStartTime,
            inputTokens: failedCodexResult?.inputTokens ?? undefined,
            cachedInputTokens: failedCodexResult?.cachedInputTokens ?? undefined,
            outputTokens: failedCodexResult?.outputTokens ?? undefined,
            codexModel: failedCodexResult?.model,
            codexReasoningEffort: failedCodexResult?.reasoningEffort ?? undefined,
            errorMessage: error.message.substring(0, 2000),
          },
        );
      } catch (statusErr) {
        this.logger.error(
          `Failed to persist FAILED status: ${(statusErr as Error).message}`,
        );
      }

      if (failureClaimed) {
        // Notify user about the failure. BitbucketService retries a repository
        // token 401 once with configured global credentials when available.
        const errorBody = `❌ Code Review 실패\n\n\`\`\`\n${error.message.substring(0, 500)}\n\`\`\``;
        try {
          if (data.triggerCommentId) {
            await this.bitbucketService.replyToComment({
              workspace: data.workspaceSlug,
              repoSlug: data.repositorySlug,
              pullRequestId: data.pullRequestId,
              parentCommentId: data.triggerCommentId,
              body: errorBody,
            });
          } else {
            await this.bitbucketService.createComment({
              workspace: data.workspaceSlug,
              repoSlug: data.repositorySlug,
              pullRequestId: data.pullRequestId,
              body: errorBody,
            });
          }
        } catch (notificationErr) {
          this.logger.error(
            `Failed to post error ${data.triggerCommentId ? "reply" : "comment"}: ${(notificationErr as Error).message}`,
          );
        }
      } else {
        this.logger.log(
          `Skipping failure notification for inactive review run ${data.reviewRunId}: ${data.idempotencyKey}`,
        );
      }

      // 게시 단계 진입 후 실패와 인증 실패는 재시도해도 복구되지 않거나
      // 중복 게시 위험이 있으므로 즉시 중단한다.
      if (publishStarted || authFailureStage) {
        throw new UnrecoverableError(error.message);
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

  // BullMQ는 재시도로 이어지는 실패에도 "failed"를 emit한다 — 최종 실패와 구분해서 남긴다.
  @OnWorkerEvent("failed")
  onFailed(job: Job<IReviewJobData>, error: Error): void {
    const attempts = job.opts?.attempts ?? 1;
    const willRetry =
      job.attemptsMade < attempts && error.name !== "UnrecoverableError";
    this.logger.error(
      willRetry
        ? `Job ${job.id} failed attempt ${job.attemptsMade}/${attempts}, retrying: ${error.message}`
        : `Job ${job.id} failed permanently after ${job.attemptsMade} attempts: ${error.message}`,
    );
  }

  /**
   * 클레임 거부의 대부분은 정상(새 커밋이 대체함)이지만, publishing에 갇힌 행은 사람이
   * 봐야 하는 예외 상황이다. 빈도가 낮은 이 경로에서만 한 번 조회해 두 경우를 로그 레벨로
   * 분리한다. 조회 실패가 제어 흐름을 바꾸면 안 되므로(catch로 떨어지면 재시도·실패 보고
   * 판단이 뒤틀린다) 예외는 삼키고 상태를 unknown으로 남긴다.
   */
  private async logInactiveRun(data: IReviewJobData): Promise<void> {
    let observedStatus = "unknown";
    try {
      const run = await this.reviewService.findById(data.reviewRunId);
      observedStatus = run?.reviewStatus ?? "missing";
    } catch (lookupErr) {
      this.logger.error(
        `Failed to look up inactive review run ${data.reviewRunId}: ${(lookupErr as Error).message}`,
      );
    }

    const message = `Skipping inactive review run ${data.reviewRunId} (status=${observedStatus}): ${data.idempotencyKey}`;
    if (observedStatus === ReviewRunStatus.PUBLISHING) {
      // 게시 클레임 응답 유실 후 재시도가 도달한 상태 — 리뷰도 실패 댓글도 없이 잔류하며
      // 새 커밋의 supersede나 force 멘션 외에는 자동 탈출구가 없다.
      this.logger.warn(message);
    } else {
      this.logger.log(message);
    }
  }

  /** Step 2: 통합 프롬프트로 단일 Codex 호출 */
  private async executeReview(
    worktreePath: string,
    baseBranch: string,
    reviewDiff: string,
    repositorySlug: string,
    excludedChangedFiles: readonly string[] | null,
  ): Promise<ICodexReviewResult> {
    // Resolve prompt file: repoCustomPromptFilepaths[repoSlug] → customPromptFilepath
    const repoCustomPromptFilepaths =
      this.configService.get<Record<string, string>>(
        "codex.repoCustomPromptFilepaths",
      ) ?? {};
    const customPromptFilepath =
      repoCustomPromptFilepaths[repositorySlug] ||
      this.configService.get<string>("codex.customPromptFilepath", "");
    let reviewPromptMode: ReviewPromptMode =
      reviewDiff.length > MAX_INLINE_REVIEW_PROMPT_CHARS
        ? "branch-diff"
        : "inline-diff";
    if (reviewPromptMode === "branch-diff") {
      this.logger.warn(
        `Review diff is ${reviewDiff.length} characters; omitting diff from Codex prompt and using branch diff mode`,
      );
    }
    let prompt = await resolveReviewPrompt(
      baseBranch,
      customPromptFilepath,
      reviewDiff,
      reviewPromptMode,
      excludedChangedFiles,
    );
    if (
      reviewPromptMode === "inline-diff" &&
      prompt.length > MAX_INLINE_REVIEW_PROMPT_CHARS
    ) {
      reviewPromptMode = "branch-diff";
      this.logger.warn(
        `Review prompt is ${prompt.length} characters after custom instructions; omitting diff from Codex prompt and using branch diff mode`,
      );
      prompt = await resolveReviewPrompt(
        baseBranch,
        customPromptFilepath,
        reviewDiff,
        reviewPromptMode,
        excludedChangedFiles,
      );
    }

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
    onResultCommentPublished: ResultCommentPublishedCallback,
  ): Promise<number | undefined> {
    const unified = parseUnifiedReviewJson(codexResult.rawOutput, (msg) =>
      this.logger.error(msg),
    );

    if (unified) {
      return this.publishUnifiedResults(
        data,
        unified,
        reviewDiff,
        onResultCommentPublished,
      );
    }

    return this.publishFallbackResults(
      data,
      codexResult.rawOutput,
      onResultCommentPublished,
    );
  }

  /** 통합 파싱 성공 시: verdict badge + summary + stats table + inline comments */
  private async publishUnifiedResults(
    data: IReviewJobData,
    unified: IUnifiedReviewResult,
    reviewDiff: string,
    onResultCommentPublished: ResultCommentPublishedCallback,
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
    await onResultCommentPublished(summaryComment.id);
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
    onResultCommentPublished: ResultCommentPublishedCallback,
  ): Promise<number | undefined> {
    this.logger.warn("Unified JSON parse failed, falling back to raw output comment");
    const comment = await this.bitbucketService.createComment({
      workspace: data.workspaceSlug,
      repoSlug: data.repositorySlug,
      pullRequestId: data.pullRequestId,
      body: `## 🔍 코드 리뷰\n\n${rawOutput}`,
    });
    await onResultCommentPublished(comment.id);
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
        codexModel: codexResult.model,
        codexReasoningEffort: codexResult.reasoningEffort ?? undefined,
      },
    );

    this.logger.log(
      `Review completed: PR #${data.pullRequestId}, comment=${commentId}, ${codexResult.durationMs}ms`,
    );
  }
}
