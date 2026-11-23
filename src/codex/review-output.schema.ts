/**
 * `codex exec --output-schema`로 넘기는 리뷰 응답 스키마.
 *
 * OpenAI structured output(strict)은 모든 property를 `required`에 두고
 * `additionalProperties: false`를 요구한다. 그래서 선택 필드는 생략 대신
 * null을 허용한다. 내용 검증(path가 diff 안인지 등)은 여전히 파서 몫이다.
 */
export const REVIEW_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "verdict", "confidence", "findings"],
  properties: {
    summary: { type: "string" },
    verdict: { type: "string", enum: ["approve", "request-changes", "comment"] },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "path",
          "line_range",
          "severity",
          "description",
          "problemCode",
          "suggestedFix",
          "reason",
        ],
        properties: {
          title: { type: "string" },
          path: { type: "string" },
          line_range: {
            type: "object",
            additionalProperties: false,
            required: ["start", "end"],
            properties: {
              start: { type: "integer" },
              end: { type: "integer" },
            },
          },
          severity: {
            type: "string",
            enum: ["blocking", "recommended", "suggestion", "tech-debt"],
          },
          description: { type: "string" },
          problemCode: { type: ["string", "null"] },
          suggestedFix: { type: ["string", "null"] },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;
