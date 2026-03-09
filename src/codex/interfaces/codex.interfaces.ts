/** Codex CLI 실행 결과 */
export interface ICodexReviewResult {
  readonly rawOutput: string;
  readonly exitCode: number;
  readonly durationMs: number;
}
