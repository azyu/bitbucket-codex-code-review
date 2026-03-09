import {
  parseReviewJson,
  parseReviewItems,
  parseUnifiedReviewJson,
  formatInlineComment,
  buildSummaryTable,
  buildVerdictBadge,
} from "./review.formatter";
import { type IReviewItem } from "./review.types";

describe("review.formatter", () => {
  describe("parseReviewItems", () => {
    it("should parse valid items from array", () => {
      const items = [
        {
          path: "src/a.ts",
          line: 10,
          severity: "blocking",
          description: "desc",
          reason: "reason",
        },
        {
          path: "src/b.ts",
          line: 20,
          severity: "recommended",
          description: "desc2",
          problemCode: "bad()",
          suggestedFix: "good()",
          reason: "reason2",
        },
      ];

      const result = parseReviewItems(items);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        path: "src/a.ts",
        line: 10,
        severity: "blocking",
      });
      expect(result[1].problemCode).toBe("bad()");
      expect(result[1].suggestedFix).toBe("good()");
    });

    it("should filter out items missing required fields", () => {
      const items = [
        { path: "a.ts", line: 1, description: "d", reason: "r" },
        { path: "b.ts", line: "not-a-number", description: "d", reason: "r" },
        { severity: "blocking", description: "d", reason: "r" },
      ];

      const result = parseReviewItems(items);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("a.ts");
    });

    it('should default invalid severity to "suggestion"', () => {
      const items = [
        { path: "a.ts", line: 1, severity: "critical", description: "d", reason: "r" },
      ];

      const result = parseReviewItems(items);

      expect(result[0].severity).toBe("suggestion");
    });

    it("should ignore non-string optional fields", () => {
      const items = [
        {
          path: "a.ts",
          line: 1,
          severity: "blocking",
          description: "d",
          reason: "r",
          problemCode: 123,
          suggestedFix: null,
        },
      ];

      const result = parseReviewItems(items);

      expect(result[0].problemCode).toBeUndefined();
      expect(result[0].suggestedFix).toBeUndefined();
    });
  });

  describe("parseReviewJson", () => {
    const validItem = {
      path: "src/app.ts",
      line: 10,
      severity: "blocking",
      description: "Null pointer",
      reason: "Will crash at runtime",
    };

    it("should parse a valid JSON array", () => {
      const input = JSON.stringify([validItem]);
      const result = parseReviewJson(input);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        path: "src/app.ts",
        line: 10,
        severity: "blocking",
        description: "Null pointer",
        reason: "Will crash at runtime",
      });
    });

    it("should extract and parse JSON from markdown code block", () => {
      const input = [
        "Here is the review:",
        "```json",
        JSON.stringify([validItem]),
        "```",
      ].join("\n");

      const result = parseReviewJson(input);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("src/app.ts");
    });

    it("should return empty array for invalid JSON", () => {
      const result = parseReviewJson("not valid json {{{");

      expect(result).toEqual([]);
    });

    it("should return empty array for non-array JSON", () => {
      const result = parseReviewJson(JSON.stringify({ key: "value" }));

      expect(result).toEqual([]);
    });

    it("should filter items with missing required fields", () => {
      const items = [
        validItem,
        { path: "src/b.ts", line: 5 },
        { severity: "blocking", description: "d", reason: "r" },
      ];
      const result = parseReviewJson(JSON.stringify(items));

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("src/app.ts");
    });

    it('should default invalid severity to "suggestion"', () => {
      const item = { ...validItem, severity: "critical" };
      const result = parseReviewJson(JSON.stringify([item]));

      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe("suggestion");
    });

    it("should call onError callback when parsing fails", () => {
      const onError = jest.fn();
      parseReviewJson("not json", onError);

      expect(onError).toHaveBeenCalledWith(
        "Failed to parse review JSON, will use fallback",
      );
    });
  });

  describe("parseUnifiedReviewJson", () => {
    const validUnified = {
      summary: "변경사항 요약입니다.",
      verdict: "approve",
      confidence: 85,
      findings: [
        {
          path: "src/app.ts",
          line: 10,
          severity: "blocking",
          description: "문제",
          reason: "이유",
        },
      ],
    };

    it("should parse a valid unified review JSON object", () => {
      const input = JSON.stringify(validUnified);
      const result = parseUnifiedReviewJson(input);

      expect(result).not.toBeNull();
      expect(result!.summary).toBe("변경사항 요약입니다.");
      expect(result!.verdict).toBe("approve");
      expect(result!.confidence).toBe(85);
      expect(result!.findings).toHaveLength(1);
      expect(result!.findings[0].path).toBe("src/app.ts");
    });

    it("should extract from markdown code block", () => {
      const input = [
        "Here is the result:",
        "```json",
        JSON.stringify(validUnified),
        "```",
      ].join("\n");

      const result = parseUnifiedReviewJson(input);

      expect(result).not.toBeNull();
      expect(result!.summary).toBe("변경사항 요약입니다.");
    });

    it("should parse when summary contains markdown code blocks", () => {
      const withCodeBlock = {
        ...validUnified,
        summary: "변경 요약:\n```ts\nconst x = 1;\n```\n끝.",
      };
      const input = [
        "Here is the result:",
        "```json",
        JSON.stringify(withCodeBlock),
        "```",
      ].join("\n");

      const result = parseUnifiedReviewJson(input);

      expect(result).not.toBeNull();
      expect(result!.summary).toContain("```ts");
      expect(result!.summary).toContain("const x = 1;");
      expect(result!.findings).toHaveLength(1);
    });

    it("should return null for array JSON", () => {
      const onError = jest.fn();
      const result = parseUnifiedReviewJson(JSON.stringify([1, 2, 3]), onError);

      expect(result).toBeNull();
      expect(onError).toHaveBeenCalledWith("Unified review JSON is not an object");
    });

    it("should return null when summary is missing", () => {
      const onError = jest.fn();
      const input = JSON.stringify({ verdict: "approve", confidence: 80, findings: [] });
      const result = parseUnifiedReviewJson(input, onError);

      expect(result).toBeNull();
      expect(onError).toHaveBeenCalledWith("Unified review JSON missing summary field");
    });

    it("should return null when summary is empty string", () => {
      const input = JSON.stringify({ ...validUnified, summary: "  " });
      const result = parseUnifiedReviewJson(input);

      expect(result).toBeNull();
    });

    it('should default invalid verdict to "comment"', () => {
      const input = JSON.stringify({ ...validUnified, verdict: "reject" });
      const result = parseUnifiedReviewJson(input);

      expect(result!.verdict).toBe("comment");
    });

    it("should clamp confidence to 0-100 range", () => {
      const input1 = JSON.stringify({ ...validUnified, confidence: 150 });
      const result1 = parseUnifiedReviewJson(input1);
      expect(result1!.confidence).toBe(100);

      const input2 = JSON.stringify({ ...validUnified, confidence: -10 });
      const result2 = parseUnifiedReviewJson(input2);
      expect(result2!.confidence).toBe(0);
    });

    it("should default confidence to 50 when not a number", () => {
      const input = JSON.stringify({ ...validUnified, confidence: "high" });
      const result = parseUnifiedReviewJson(input);

      expect(result!.confidence).toBe(50);
    });

    it("should handle missing findings as empty array", () => {
      const input = JSON.stringify({
        summary: "요약",
        verdict: "approve",
        confidence: 90,
      });
      const result = parseUnifiedReviewJson(input);

      expect(result!.findings).toEqual([]);
    });

    it("should filter invalid findings items", () => {
      const input = JSON.stringify({
        ...validUnified,
        findings: [
          { path: "a.ts", line: 1, description: "d", reason: "r" },
          { path: "b.ts" }, // missing required fields
        ],
      });
      const result = parseUnifiedReviewJson(input);

      expect(result!.findings).toHaveLength(1);
    });

    it("should return null for invalid JSON and call onError", () => {
      const onError = jest.fn();
      const result = parseUnifiedReviewJson("not json {{{", onError);

      expect(result).toBeNull();
      expect(onError).toHaveBeenCalledWith("Failed to parse unified review JSON");
    });
  });

  describe("formatInlineComment", () => {
    it("should format a blocking item correctly", () => {
      const item: IReviewItem = {
        path: "src/app.ts",
        line: 42,
        severity: "blocking",
        description: "SQL injection vulnerability",
        problemCode: "db.query(`SELECT * FROM ${input}`)",
        suggestedFix: "db.query('SELECT * FROM ?', [input])",
        reason: "User input is not sanitized",
      };

      const result = formatInlineComment(item);

      expect(result).toContain("**Blocking**");
      expect(result).toContain("SQL injection vulnerability");
      expect(result).toContain("**문제 코드**:");
      expect(result).toContain("**수정 제안**:");
      expect(result).toContain("**이유**: User input is not sanitized");
    });

    it("should format item without optional fields", () => {
      const item: IReviewItem = {
        path: "src/app.ts",
        line: 10,
        severity: "suggestion",
        description: "Consider extracting constant",
        reason: "Improves readability",
      };

      const result = formatInlineComment(item);

      expect(result).toContain("**Suggestion**");
      expect(result).toContain("Consider extracting constant");
      expect(result).not.toContain("**문제 코드**:");
      expect(result).not.toContain("**수정 제안**:");
      expect(result).toContain("**이유**: Improves readability");
    });
  });

  describe("buildSummaryTable", () => {
    it("should count severities correctly", () => {
      const items: ReadonlyArray<IReviewItem> = [
        { path: "a.ts", line: 1, severity: "blocking", description: "d1", reason: "r1" },
        { path: "b.ts", line: 2, severity: "blocking", description: "d2", reason: "r2" },
        { path: "c.ts", line: 3, severity: "recommended", description: "d3", reason: "r3" },
        { path: "d.ts", line: 4, severity: "suggestion", description: "d4", reason: "r4" },
        { path: "e.ts", line: 5, severity: "tech-debt", description: "d5", reason: "r5" },
        { path: "f.ts", line: 6, severity: "tech-debt", description: "d6", reason: "r6" },
      ];

      const result = buildSummaryTable(items);

      expect(result).toContain("| 분류 | 건수 |");
      expect(result).toContain("|------|------|");
      expect(result).toContain("Blocking | 2건");
      expect(result).toContain("Recommended | 1건");
      expect(result).toContain("Suggestion | 1건");
      expect(result).toContain("Tech Debt | 2건");
    });

    it("should return zero counts for unused severities", () => {
      const items: ReadonlyArray<IReviewItem> = [
        { path: "a.ts", line: 1, severity: "blocking", description: "d", reason: "r" },
      ];

      const result = buildSummaryTable(items);

      expect(result).toContain("Recommended | 0건");
      expect(result).toContain("Suggestion | 0건");
      expect(result).toContain("Tech Debt | 0건");
    });
  });

  describe("buildVerdictBadge", () => {
    it("should format approve verdict", () => {
      const result = buildVerdictBadge("approve", 90);

      expect(result).toBe("✅ **Approve** (confidence: 90%)");
    });

    it("should format request-changes verdict", () => {
      const result = buildVerdictBadge("request-changes", 75);

      expect(result).toBe("🔴 **Request Changes** (confidence: 75%)");
    });

    it("should format comment verdict", () => {
      const result = buildVerdictBadge("comment", 50);

      expect(result).toBe("💬 **Comment** (confidence: 50%)");
    });
  });
});
