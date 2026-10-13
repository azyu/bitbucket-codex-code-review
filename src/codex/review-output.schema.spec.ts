import { REVIEW_OUTPUT_SCHEMA } from "./review-output.schema";
import { parseUnifiedReviewJson } from "../queue/review.formatter";
import { SEVERITY_LABEL } from "../queue/review.types";

type SchemaNode = {
  type?: unknown;
  properties?: Record<string, SchemaNode>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: SchemaNode;
};

function collectObjects(node: SchemaNode, out: SchemaNode[] = []): SchemaNode[] {
  if (node.properties) {
    out.push(node);
    Object.values(node.properties).forEach((child) => collectObjects(child, out));
  }
  if (node.items) collectObjects(node.items, out);
  return out;
}

describe("REVIEW_OUTPUT_SCHEMA", () => {
  // strict structured output은 이 규칙을 어긴 스키마를 요청 단계에서 거절한다.
  // 그러면 리뷰가 형식 강제가 아니라 실행 실패로 끝난다.
  it("lists every property as required and forbids extras on every object", () => {
    const objects = collectObjects(REVIEW_OUTPUT_SCHEMA as SchemaNode);
    expect(objects.length).toBeGreaterThan(0);
    for (const obj of objects) {
      expect([...(obj.required ?? [])].sort()).toEqual(Object.keys(obj.properties!).sort());
      expect(obj.additionalProperties).toBe(false);
    }
  });

  // 스키마가 파서가 모르는 severity를 허용하면 그 finding은 조용히 suggestion으로 강등된다.
  it("allows exactly the severities the parser knows", () => {
    const severity = REVIEW_OUTPUT_SCHEMA.properties.findings.items.properties.severity;
    expect([...severity.enum].sort()).toEqual(Object.keys(SEVERITY_LABEL).sort());
  });

  it("parses a schema-shaped response whose optional fields are null", () => {
    const result = parseUnifiedReviewJson(
      JSON.stringify({
        summary: "### 변경 개요\n- x",
        verdict: "comment",
        confidence: 80,
        findings: [
          {
            title: "t",
            path: "src/a.ts",
            line_range: { start: 1, end: 2 },
            severity: "recommended",
            description: "d",
            problemCode: null,
            suggestedFix: null,
            reason: "r",
          },
        ],
      }),
    );

    expect(result?.findings).toHaveLength(1);
    expect(result?.findings[0]).toMatchObject({ severity: "recommended", problemCode: undefined, suggestedFix: undefined });
  });
});
