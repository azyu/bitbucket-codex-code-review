/** 리뷰 심각도 타입 */
export type ReviewSeverity =
  | "blocking"
  | "recommended"
  | "suggestion"
  | "tech-debt";

/** 리뷰 항목 인터페이스 */
export interface IReviewItem {
  readonly path: string;
  readonly line: number;
  readonly severity: ReviewSeverity;
  readonly description: string;
  readonly problemCode?: string;
  readonly suggestedFix?: string;
  readonly reason: string;
}

/** 심각도별 이모지 */
export const SEVERITY_EMOJI: Readonly<Record<ReviewSeverity, string>> = {
  blocking: "🚫",
  recommended: "⚠️",
  suggestion: "💡",
  "tech-debt": "📝",
};

/** 심각도별 라벨 */
export const SEVERITY_LABEL: Readonly<Record<ReviewSeverity, string>> = {
  blocking: "Blocking",
  recommended: "Recommended",
  suggestion: "Suggestion",
  "tech-debt": "Tech Debt",
};

/** 유효한 심각도 값 집합 */
export const VALID_SEVERITIES: ReadonlySet<string> = new Set<string>([
  "blocking",
  "recommended",
  "suggestion",
  "tech-debt",
]);
