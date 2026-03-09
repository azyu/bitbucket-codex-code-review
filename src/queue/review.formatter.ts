import {
  type ReviewSeverity,
  type ReviewVerdict,
  type IReviewItem,
  type IUnifiedReviewResult,
  SEVERITY_EMOJI,
  SEVERITY_LABEL,
  VALID_SEVERITIES,
  VERDICT_EMOJI,
  VERDICT_LABEL,
  VALID_VERDICTS,
} from "./review.types";

/** 인라인 코멘트를 구조화된 마크다운으로 포맷팅 */
export function formatInlineComment(item: IReviewItem): string {
  const emoji = SEVERITY_EMOJI[item.severity] ?? "💡";
  const label = SEVERITY_LABEL[item.severity] ?? "Suggestion";

  const parts: string[] = [`${emoji} **${label}**`, ""];
  parts.push(`**문제**: ${item.description}`);

  if (item.problemCode) {
    parts.push("", "**문제 코드**:", "```", item.problemCode, "```");
  }

  if (item.suggestedFix) {
    parts.push("", "**수정 제안**:", "```", item.suggestedFix, "```");
  }

  parts.push("", `**이유**: ${item.reason}`);

  return parts.join("\n");
}

/** 리뷰 항목에서 severity별 건수 요약 테이블 생성 */
export function buildSummaryTable(
  items: ReadonlyArray<IReviewItem>,
): string {
  const counts: Readonly<Record<ReviewSeverity, number>> = items.reduce(
    (acc, item) => {
      if (item.severity in acc) {
        return { ...acc, [item.severity]: acc[item.severity] + 1 };
      }
      return acc;
    },
    { blocking: 0, recommended: 0, suggestion: 0, "tech-debt": 0 } as Record<
      ReviewSeverity,
      number
    >,
  );

  const rows = (
    Object.entries(SEVERITY_EMOJI) as [ReviewSeverity, string][]
  ).map(([severity, emoji]) => {
    const label = SEVERITY_LABEL[severity];
    return `| ${emoji} ${label} | ${counts[severity]}건 |`;
  });

  return [
    "---",
    "",
    "## 📊 리뷰 결과 요약",
    "",
    "| 분류 | 건수 |",
    "|------|------|",
    ...rows,
  ].join("\n");
}

/** raw 텍스트에서 JSON 문자열 추출 (가장 바깥 {}/[] 브래킷 기반) */
function extractJsonString(rawOutput: string): string {
  const trimmed = rawOutput.trim();

  // 1차: 가장 바깥 JSON 객체/배열 브래킷을 직접 매칭
  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  const startIdx =
    firstBrace === -1
      ? firstBracket
      : firstBracket === -1
        ? firstBrace
        : Math.min(firstBrace, firstBracket);

  if (startIdx !== -1) {
    const openChar = trimmed[startIdx];
    const closeChar = openChar === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIdx; i < trimmed.length; i++) {
      const ch = trimmed[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (ch === "\\") {
        escape = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === openChar) depth++;
      else if (ch === closeChar) depth--;

      if (depth === 0) {
        return trimmed.slice(startIdx, i + 1);
      }
    }
  }

  // 2차 fallback: 그대로 반환
  return trimmed;
}

/** parsed 배열에서 IReviewItem[] 변환 (공통 로직) */
export function parseReviewItems(
  parsed: unknown[],
): ReadonlyArray<IReviewItem> {
  return parsed
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).path === "string" &&
        typeof (item as Record<string, unknown>).line === "number" &&
        typeof (item as Record<string, unknown>).description === "string" &&
        typeof (item as Record<string, unknown>).reason === "string",
    )
    .map((item) => ({
      path: item.path as string,
      line: item.line as number,
      severity: (
        VALID_SEVERITIES.has(item.severity as string)
          ? item.severity
          : "suggestion"
      ) as ReviewSeverity,
      description: item.description as string,
      problemCode:
        typeof item.problemCode === "string"
          ? item.problemCode
          : undefined,
      suggestedFix:
        typeof item.suggestedFix === "string"
          ? item.suggestedFix
          : undefined,
      reason: item.reason as string,
    }));
}

/** codex 출력에서 JSON 배열 파싱 (실패 시 빈 배열 반환) */
export function parseReviewJson(
  rawOutput: string,
  onError?: (message: string) => void,
): ReadonlyArray<IReviewItem> {
  try {
    const jsonStr = extractJsonString(rawOutput);
    const parsed: unknown = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) return [];

    return parseReviewItems(parsed);
  } catch {
    onError?.("Failed to parse review JSON, will use fallback");
    return [];
  }
}

/** codex 통합 출력에서 IUnifiedReviewResult 파싱 (실패 시 null 반환) */
export function parseUnifiedReviewJson(
  rawOutput: string,
  onError?: (message: string) => void,
): IUnifiedReviewResult | null {
  try {
    const jsonStr = extractJsonString(rawOutput);
    const parsed: unknown = JSON.parse(jsonStr);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      onError?.("Unified review JSON is not an object");
      return null;
    }

    const obj = parsed as Record<string, unknown>;

    // summary 필수
    if (typeof obj.summary !== "string" || obj.summary.trim().length === 0) {
      onError?.("Unified review JSON missing summary field");
      return null;
    }

    // verdict 정규화
    const verdict: ReviewVerdict = VALID_VERDICTS.has(obj.verdict as string)
      ? (obj.verdict as ReviewVerdict)
      : "comment";

    // confidence 정규화 (0-100)
    const rawConfidence = typeof obj.confidence === "number" ? obj.confidence : 50;
    const confidence = Math.max(0, Math.min(100, rawConfidence));

    // findings 파싱
    const findings: ReadonlyArray<IReviewItem> = Array.isArray(obj.findings)
      ? parseReviewItems(obj.findings)
      : [];

    return {
      summary: obj.summary as string,
      verdict,
      confidence,
      findings,
    };
  } catch {
    onError?.("Failed to parse unified review JSON");
    return null;
  }
}

/** verdict + confidence 뱃지 문자열 생성 */
export function buildVerdictBadge(
  verdict: ReviewVerdict,
  confidence: number,
): string {
  const emoji = VERDICT_EMOJI[verdict];
  const label = VERDICT_LABEL[verdict];
  return `${emoji} **${label}** (confidence: ${confidence}%)`;
}
