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
  readonly endLine?: number;
  readonly severity: ReviewSeverity;
  readonly title?: string;
  readonly confidence?: number;
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

/** 리뷰 판정 타입 */
export type ReviewVerdict = "approve" | "request-changes" | "comment";

/** 통합 리뷰 결과 인터페이스 */
export interface IUnifiedReviewResult {
  readonly summary: string;
  readonly verdict: ReviewVerdict;
  readonly confidence: number;
  readonly findings: ReadonlyArray<IReviewItem>;
}

/** 판정별 이모지 */
export const VERDICT_EMOJI: Readonly<Record<ReviewVerdict, string>> = {
  approve: "✅",
  "request-changes": "🔴",
  comment: "💬",
};

/** 판정별 라벨 */
export const VERDICT_LABEL: Readonly<Record<ReviewVerdict, string>> = {
  approve: "Approve",
  "request-changes": "Request Changes",
  comment: "Comment",
};

/** 유효한 판정 값 집합 */
export const VALID_VERDICTS: ReadonlySet<string> = new Set<string>([
  "approve",
  "request-changes",
  "comment",
]);
