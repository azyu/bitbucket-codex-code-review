import {
  type ReviewSeverity,
  type IReviewItem,
  SEVERITY_EMOJI,
  SEVERITY_LABEL,
  VALID_SEVERITIES,
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

/** codex 출력에서 JSON 배열 파싱 (실패 시 빈 배열 반환) */
export function parseReviewJson(
  rawOutput: string,
  onError?: (message: string) => void,
): ReadonlyArray<IReviewItem> {
  try {
    // Extract JSON from markdown code block or raw text
    const jsonMatch = rawOutput.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawOutput.trim();
    const parsed: unknown = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) return [];

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
  } catch {
    onError?.("Failed to parse review JSON, will use fallback");
    return [];
  }
}
