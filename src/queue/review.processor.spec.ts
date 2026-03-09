import {
  parseReviewJson,
  formatInlineComment,
  buildSummaryTable,
} from "./review.formatter";
import { type IReviewItem } from "./review.types";

describe("review.formatter", () => {
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
});
