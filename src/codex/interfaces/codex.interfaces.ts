/** Codex CLI 실행 결과 */
export interface ICodexReviewResult {
  readonly rawOutput: string;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
  /** 이 실행에 실제로 넘긴 --model 값 */
  readonly model: string;
  /** 넘긴 model_reasoning_effort 값. 미설정이면 null */
  readonly reasoningEffort: string | null;
}
