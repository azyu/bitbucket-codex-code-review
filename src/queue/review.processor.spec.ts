import {
  parseReviewJson,
  parseReviewItems,
  parseUnifiedReviewJson,
  formatInlineComment,
  buildSummaryTable,
  buildVerdictBadge,
  normalizeSummaryMarkdown,
} from "./review.formatter";
import { type IReviewItem } from "./review.types";
import { buildReviewPrompt, resolveReviewPrompt } from "./review.prompt";
import { ReviewProcessor } from "./review.processor";
import type { ICodexReviewResult } from "../codex/interfaces/codex.interfaces";
import { TriggerType } from "../entities/review-run.entity";
import { IReviewJobData } from "./interfaces/queue.interfaces";
import { rm, writeFile } from "node:fs/promises";
import { UnrecoverableError } from "bullmq";

jest.mock("@lib/logger", () => ({
  ServiceLogger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  })),
}));

describe("review.prompt", () => {
  it.each([
    {
      baseBranch: "release&hotfix",
      quotedBaseRef: "'refs/heads/release&hotfix'",
      unsafeToken: "refs/heads/release&hotfix HEAD",
    },
    {
      baseBranch: "base'quote",
      quotedBaseRef: "'refs/heads/base'\\''quote'",
      unsafeToken: "refs/heads/base'quote HEAD",
    },
  ])(
    "should shell-quote metacharacters in branch-diff base ref $baseBranch",
    ({ baseBranch, quotedBaseRef, unsafeToken }) => {
      const prompt = buildReviewPrompt(baseBranch, "", "branch-diff");

      expect(prompt).toContain(`기준 브랜치(base branch): ${baseBranch}`);
      expect(prompt).not.toContain(`git merge-base ${unsafeToken}`);
      expect(prompt).toContain(`git merge-base ${quotedBaseRef} HEAD`);
    },
  );

  describe("excluded changed files section", () => {
    it.each(["inline-diff", "branch-diff"] as const)(
      "should list excluded but changed files in %s mode",
      (mode) => {
        const prompt = buildReviewPrompt("main", "diff --git a/a b/a", mode, [
          "M pnpm-lock.yaml",
        ]);

        expect(prompt).toContain("## diff에서 제외된 변경 파일");
        expect(prompt).toContain("- M pnpm-lock.yaml");
        expect(prompt).toContain('"변경되지 않았다"');
      },
    );

    it("should state that no excluded file changed when the list is empty", () => {
      const prompt = buildReviewPrompt("main", "diff --git a/a b/a");

      expect(prompt).toContain("## diff에서 제외된 변경 파일");
      expect(prompt).toContain("그중 변경된 파일이 없어");
      expect(prompt).not.toContain("- M pnpm-lock.yaml");
    });

    it("should not claim absence when the excluded file lookup failed", () => {
      const prompt = buildReviewPrompt(
        "main",
        "diff --git a/a b/a",
        "inline-diff",
        null,
      );

      expect(prompt).toContain("목록을 조회하지 못해서");
      expect(prompt).toContain("lock 갱신 누락 여부는 판단하지 말고");
      expect(prompt).not.toContain("그중 변경된 파일이 없어");
    });

    it("should allow reporting deleted lock files while explaining status codes", () => {
      const prompt = buildReviewPrompt(
        "main",
        "diff --git a/package.json b/package.json",
        "inline-diff",
        ["D pnpm-lock.yaml"],
      );

      expect(prompt).toContain("- D pnpm-lock.yaml");
      expect(prompt).toContain("M=수정, A=추가, D=삭제, R=이름 변경");
      expect(prompt).toContain("D/R처럼 삭제·이름 변경 상태라면");
    });

    it("should forward excluded files through resolveReviewPrompt", async () => {
      const result = await resolveReviewPrompt("main", "", "diff", "inline-diff", [
        "M pnpm-lock.yaml",
      ]);

      expect(result).toContain("- M pnpm-lock.yaml");
    });
  });

  describe("verifiability gate", () => {
    it.each(["inline-diff", "branch-diff"] as const)(
      "should separate finding scope from evidence scope in %s mode",
      (mode) => {
        const prompt = buildReviewPrompt("main", "diff --git a/a b/a", mode);

        expect(prompt).toContain("지적 대상");
        expect(prompt).toContain("근거까지 diff 텍스트로 제한되는 건 아니야");
        expect(prompt).toContain("현재 worktree의 실제 파일과 git 이력을 읽어");
        // 조건부 — 모든 리뷰에 파일 읽기 왕복을 붙이지 않는다
        expect(prompt).toContain("그 외에는 diff만 보고 판단해도 돼");
        expect(prompt).not.toContain("만 근거로 사용해줘");
      },
    );

    it("should require verification before blocking on runtime-behavior claims", () => {
      const prompt = buildReviewPrompt("main", "diff --git a/a b/a");

      expect(prompt).toContain("런타임 동작");
      expect(prompt).toContain("`git log -- <경로>` / `git show`");
      expect(prompt).toContain("같은 검사를 거쳐 이미 머지돼 있는지가 직접적인 반증");
      // 머지 전례를 정당성 근거로 확대 해석해 정상 지적을 억제하면 안 된다
      expect(prompt).toContain("코드가 옳다는 근거는 아니야");
      expect(prompt).toContain(
        '확인하지 못했으면 "blocking"으로 올리지 말고 "suggestion"으로 낮추고',
      );
    });
  });

  describe("resolveReviewPrompt", () => {
    it("should return default prompt when filepath is empty", async () => {
      const result = await resolveReviewPrompt("main", "");

      expect(result).toContain("'main'");
      expect(result).toContain("버그 판정 기준");
      expect(result).not.toContain("추가 리뷰 지시사항");
    });

    it("should append custom prompt after default prompt", async () => {
      const fs = await import("fs/promises");
      const tmpFile = `/tmp/test-prompt-${Date.now()}.txt`;
      await fs.writeFile(tmpFile, "React hooks 규칙을 엄격히 적용해줘.");

      try {
        const result = await resolveReviewPrompt("develop", tmpFile);

        expect(result).toContain("'develop'");
        expect(result).toContain("버그 판정 기준");
        expect(result).toContain("## 추가 리뷰 지시사항");
        expect(result).toContain("React hooks 규칙을 엄격히 적용해줘.");
      } finally {
        await fs.rm(tmpFile, { force: true });
      }
    });

    it("should throw when file does not exist", async () => {
      await expect(
        resolveReviewPrompt("main", "/nonexistent/path/prompt.txt"),
      ).rejects.toThrow('Failed to read custom prompt file "/nonexistent/path/prompt.txt"');
    });
  });
});

describe("review.formatter", () => {
  describe("parseReviewItems", () => {
    it("should parse valid items with line_range", () => {
      const items = [
        {
          title: "null 체크 누락",
          path: "src/a.ts",
          line_range: { start: 10, end: 15 },
          severity: "blocking",
          description: "desc",
          reason: "reason",
        },
        {
          title: "변수명 개선",
          path: "src/b.ts",
          line_range: { start: 20, end: 20 },
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
        title: "null 체크 누락",
        path: "src/a.ts",
        lineRange: { start: 10, end: 15 },
        severity: "blocking",
      });
      expect(result[1].problemCode).toBe("bad()");
      expect(result[1].suggestedFix).toBe("good()");
    });

    it("should support legacy line field (backward compat)", () => {
      const items = [
        {
          path: "src/a.ts",
          line: 10,
          severity: "blocking",
          description: "desc",
          reason: "reason",
        },
      ];

      const result = parseReviewItems(items);

      expect(result).toHaveLength(1);
      expect(result[0].lineRange).toEqual({ start: 10, end: 10 });
    });

    it("should prefer line_range over line when both present", () => {
      const items = [
        {
          path: "src/a.ts",
          line: 5,
          line_range: { start: 10, end: 15 },
          severity: "blocking",
          description: "desc",
          reason: "reason",
        },
      ];

      const result = parseReviewItems(items);

      expect(result[0].lineRange).toEqual({ start: 10, end: 15 });
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

    it("should default title to empty string when missing", () => {
      const items = [
        { path: "a.ts", line: 1, severity: "blocking", description: "d", reason: "r" },
      ];

      const result = parseReviewItems(items);

      expect(result[0].title).toBe("");
    });

    it("should reject items with no line or line_range", () => {
      const items = [
        { path: "a.ts", severity: "blocking", description: "d", reason: "r" },
      ];

      const result = parseReviewItems(items);

      expect(result).toHaveLength(0);
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
        lineRange: { start: 10, end: 10 },
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
          title: "null 체크 누락",
          path: "src/app.ts",
          line_range: { start: 10, end: 12 },
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
      expect(result!.findings[0].lineRange).toEqual({ start: 10, end: 12 });
      expect(result!.findings[0].title).toBe("null 체크 누락");
      expect(result!.findings[0].severity).toBe("blocking");
    });

    it("should parse legacy format with line field", () => {
      const legacyUnified = {
        summary: "요약",
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
      const result = parseUnifiedReviewJson(JSON.stringify(legacyUnified));

      expect(result).not.toBeNull();
      expect(result!.findings[0].lineRange).toEqual({ start: 10, end: 10 });
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
    it("should format a blocking item with title", () => {
      const item: IReviewItem = {
        title: "SQL injection 취약점",
        path: "src/app.ts",
        lineRange: { start: 40, end: 45 },
        severity: "blocking",
        description: "SQL injection vulnerability",
        problemCode: "db.query(`SELECT * FROM ${input}`)",
        suggestedFix: "db.query('SELECT * FROM ?', [input])",
        reason: "User input is not sanitized",
      };

      const result = formatInlineComment(item);

      expect(result).toContain("**Blocking**");
      expect(result).toContain("**SQL injection 취약점**");
      expect(result).toContain("L40-L45");
      expect(result).toContain("SQL injection vulnerability");
      expect(result).toContain("**문제 코드**:");
      expect(result).toContain("**수정 제안**:");
      expect(result).toContain("**이유**: User input is not sanitized");
    });

    it("should not show line range when start equals end", () => {
      const item: IReviewItem = {
        title: "단일 라인",
        path: "src/app.ts",
        lineRange: { start: 10, end: 10 },
        severity: "suggestion",
        description: "Consider extracting constant",
        reason: "Improves readability",
      };

      const result = formatInlineComment(item);

      expect(result).toContain("**Suggestion**");
      expect(result).not.toContain("L10-L10");
      expect(result).toContain("Consider extracting constant");
      expect(result).not.toContain("**문제 코드**:");
      expect(result).not.toContain("**수정 제안**:");
      expect(result).toContain("**이유**: Improves readability");
    });

    it("should handle empty title gracefully", () => {
      const item: IReviewItem = {
        title: "",
        path: "src/app.ts",
        lineRange: { start: 10, end: 10 },
        severity: "recommended",
        description: "desc",
        reason: "reason",
      };

      const result = formatInlineComment(item);

      expect(result).not.toContain("****"); // empty bold
    });
  });

  describe("buildSummaryTable", () => {
    it("should count severities correctly", () => {
      const items: ReadonlyArray<IReviewItem> = [
        { title: "", path: "a.ts", lineRange: { start: 1, end: 1 }, severity: "blocking", description: "d1", reason: "r1" },
        { title: "", path: "b.ts", lineRange: { start: 2, end: 2 }, severity: "blocking", description: "d2", reason: "r2" },
        { title: "", path: "c.ts", lineRange: { start: 3, end: 3 }, severity: "recommended", description: "d3", reason: "r3" },
        { title: "", path: "d.ts", lineRange: { start: 4, end: 4 }, severity: "suggestion", description: "d4", reason: "r4" },
        { title: "", path: "e.ts", lineRange: { start: 5, end: 5 }, severity: "tech-debt", description: "d5", reason: "r5" },
        { title: "", path: "f.ts", lineRange: { start: 6, end: 6 }, severity: "tech-debt", description: "d6", reason: "r6" },
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
        { title: "", path: "a.ts", lineRange: { start: 1, end: 1 }, severity: "blocking", description: "d", reason: "r" },
      ];

      const result = buildSummaryTable(items);

      expect(result).toContain("Recommended | 0건");
      expect(result).toContain("Suggestion | 0건");
      expect(result).toContain("Tech Debt | 0건");
    });
  });

  describe("normalizeSummaryMarkdown", () => {
    it("should convert compact numbered sections into markdown headings and bullets", () => {
      const input = [
        "1) 변경 개요 - learning-trace와 bff-rtc에서 사용하지 않거나 불필요해진 데이터베이스 설정 코드를 정리했고, 예제 환경변수 파일도 이에 맞게 축소했습니다. - bff-ac-lrm의 예제 환경변수에서는 실제로 사용되지 않는 GRPC_PORT 항목이 제거되었습니다.",
        "2) 주요 변경사항 - apps/learning-trace에서 DB 설정(configuration.ts, validation.ts)의 DB 관련 항목 제거 - apps/learning-trace의 TypeORM 초기화 파일과 DatabaseModule 삭제",
        "3) 영향 범위 - 런타임 기준으로는 DB를 직접 사용하지 않는 서비스들의 설정 표면이 단순화됩니다. - 신규 개발자 온보딩, 로컬 실행, 환경변수 관리 문서화 측면에서 혼란이 줄어듭니다.",
      ].join("\n");

      const result = normalizeSummaryMarkdown(input);

      expect(result).toContain("### 변경 개요");
      expect(result).toContain("### 주요 변경사항");
      expect(result).toContain("### 영향 범위");
      expect(result).toContain("\n- learning-trace와 bff-rtc에서 사용하지 않거나 불필요해진 데이터베이스 설정 코드를 정리했고, 예제 환경변수 파일도 이에 맞게 축소했습니다.");
      expect(result).toContain("\n- bff-ac-lrm의 예제 환경변수에서는 실제로 사용되지 않는 GRPC_PORT 항목이 제거되었습니다.");
      expect(result).not.toContain("1) 변경 개요");
    });

    it("should keep existing markdown headings and bullets intact", () => {
      const input = [
        "### 변경 개요",
        "- DB 설정 제거",
        "",
        "### 주요 변경사항",
        "- TypeORM 초기화 파일 삭제",
      ].join("\n");

      expect(normalizeSummaryMarkdown(input)).toBe(input);
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

describe("ReviewProcessor publish results", () => {
  const mockReviewService = {
    updateStatus: jest.fn(),
    updateResultCommentId: jest.fn(),
    existsByIdempotencyKey: jest.fn(),
    createReviewRun: jest.fn(),
    supersedeActivePrReviews: jest.fn(),
  };
  const mockWorkspaceService = {
    prepareWorktree: jest.fn(),
    createReviewDiff: jest.fn(),
    cleanupWorktree: jest.fn(),
  };
  const mockCodexService = {
    executeCodex: jest.fn(),
  };
  const mockBitbucketService = {
    createComment: jest.fn().mockResolvedValue({ id: 100 }),
    replyToComment: jest.fn().mockResolvedValue({ id: 101 }),
    createInlineComment: jest.fn().mockResolvedValue({ id: 102 }),
  };
  const mockConfigService = {
    get: jest.fn().mockReturnValue(""),
    getOrThrow: jest.fn(),
  };

  let processor: ReviewProcessor;
  type ReviewProcessorWithExecuteReview = {
    executeReview(
      worktreePath: string,
      baseBranch: string,
      reviewDiff: string,
      repositorySlug: string,
      excludedChangedFiles: readonly string[] | null,
    ): Promise<ICodexReviewResult>;
  };


  const baseJobData: IReviewJobData = {
    reviewRunId: 1,
    repositorySlug: "my-repo",
    workspaceSlug: "my-workspace",
    pullRequestId: 42,
    headCommitHash: "abc1234",
    baseCommitHash: "def5678",
    baseBranch: "main",
    headBranch: "feature/test",
    cloneUrl: "https://bitbucket.org/my-workspace/my-repo.git",
    idempotencyKey: "my-repo:42:abc1234",
    triggerType: TriggerType.MENTION,
    triggerCommentId: 999,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigService.get.mockReturnValue("");
    mockWorkspaceService.createReviewDiff.mockResolvedValue({
      diff: "diff --git a/src/app.ts b/src/app.ts\n+++ b/src/app.ts\n@@ -1,1 +1,1 @@\n+new line",
      excludedChangedFiles: [],
    });
    processor = new ReviewProcessor(
      mockReviewService as never,
      mockWorkspaceService as never,
      mockCodexService as never,
      mockBitbucketService as never,
      mockConfigService as never,
    );
  });

  describe("executeReview prompt shaping", () => {
    it.each([
      {
        name: "small diff",
        reviewDiff: [
          "diff --git a/src/app.ts b/src/app.ts",
          "index 1111111..2222222 100644",
          "--- a/src/app.ts",
          "+++ b/src/app.ts",
          "@@ -1 +1 @@",
          "+console.log('ok')",
        ].join("\n"),
        expectInlineDiff: true,
      },
      {
        name: "large diff",
        reviewDiff: Array.from(
          { length: 32_000 },
          (_, index) => `+generated-change-${index} ${"x".repeat(40)}`,
        ).join("\n"),
        expectInlineDiff: false,
      },
    ])("should shape prompt for $name", async ({ reviewDiff, expectInlineDiff }) => {
      mockCodexService.executeCodex.mockResolvedValue({
        rawOutput: '{"summary":"ok","verdict":"approve","confidence":100,"findings":[]}',
        exitCode: 0,
        durationMs: 1,
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
      });

      await (processor as unknown as ReviewProcessorWithExecuteReview).executeReview(
        "/worktree",
        "main",
        reviewDiff,
        "my-repo",
        [],
      );

      const prompt = mockCodexService.executeCodex.mock.calls[0][2];

      expect(prompt).toContain(
        "'main' 기준 PR merge-base부터 HEAD까지의 코드 변경사항을 한국어로 코드 리뷰해줘.",
      );
      if (expectInlineDiff) {
        expect(prompt).toContain(
          "지적 대상은 이 프롬프트 하단의 `리뷰 대상 PR diff`에 포함된 변경으로 한정해줘.",
        );
        expect(prompt).toContain("```diff");
        expect(prompt).toContain(reviewDiff);
      } else {
        expect(prompt).not.toContain("<merge-base>..HEAD");
        expect(prompt).toContain("git merge-base 'refs/heads/main' HEAD");
        expect(prompt).toMatch(
          /git diff[^\n]*(?:\$\([^\n]*git merge-base[^\n]*\)|\$\{[A-Za-z_][A-Za-z0-9_]*\})\.\.HEAD/,
        );
        expect(prompt).not.toContain(
          "지적 대상은 이 프롬프트 하단의 `리뷰 대상 PR diff`에 포함된 변경으로 한정해줘.",
        );
        expect(prompt).not.toContain("generated-change-2048");
        expect(prompt).toMatch(/git diff/);
        expect(prompt).toMatch(/worktree|현재 브랜치|체크아웃된 브랜치/);
        expect(prompt).toMatch(/base\s*branch|기준\s*브랜치/);
      }
    });
    it("should switch to branch diff when the custom prompt makes the final inline prompt too large", async () => {
      const tmpFile = `/tmp/test-custom-prompt-${Date.now()}.txt`;
      const customPrompt = `추가 리뷰 지시사항:\n${"A".repeat(950_000)}`;
      await writeFile(tmpFile, customPrompt);

      try {
        mockConfigService.get.mockImplementation(
          (key: string, defaultValue?: string) =>
            key === "codex.customPromptFilepath"
              ? tmpFile
              : defaultValue ?? "",
        );
        mockCodexService.executeCodex.mockResolvedValueOnce({
          rawOutput: '{"summary":"ok","verdict":"approve","confidence":100,"findings":[]}',
          exitCode: 0,
          durationMs: 1,
          inputTokens: null,
          cachedInputTokens: null,
          outputTokens: null,
        });

        const reviewDiff = [
          "diff --git a/src/app.ts b/src/app.ts",
          "index 1111111..2222222 100644",
          "--- a/src/app.ts",
          "+++ b/src/app.ts",
          "@@ -1 +1 @@",
          "+INLINE_DIFF_MARKER",
          `${"x".repeat(119_950)}`,
        ].join("\n");

        await (processor as unknown as ReviewProcessorWithExecuteReview).executeReview(
          "/worktree",
          "main",
          reviewDiff,
          "my-repo",
          [],
        );

        const prompt = mockCodexService.executeCodex.mock.calls[0][2];

        expect(prompt).toContain("프롬프트에 diff를 첨부하지 않는다.");
        expect(prompt).not.toContain("```diff");
        expect(prompt).not.toContain("INLINE_DIFF_MARKER");
      } finally {
        await rm(tmpFile, { force: true });
      }
    });

    it("should append per-repo custom prompt when repository slug is mapped", async () => {
      const tmpFile = `/tmp/test-repo-prompt-${Date.now()}.md`;
      await writeFile(tmpFile, "REPO_SPECIFIC_GUIDELINE_MARKER");

      try {
        mockConfigService.get.mockImplementation(
          (key: string, defaultValue?: string) =>
            key === "codex.repoCustomPromptFilepaths"
              ? { "my-repo": tmpFile }
              : defaultValue ?? "",
        );
        mockCodexService.executeCodex.mockResolvedValueOnce({
          rawOutput: '{"summary":"ok","verdict":"approve","confidence":100,"findings":[]}',
          exitCode: 0,
          durationMs: 1,
          inputTokens: null,
          cachedInputTokens: null,
          outputTokens: null,
        });

        await (processor as unknown as ReviewProcessorWithExecuteReview).executeReview(
          "/worktree",
          "main",
          "diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n+ok",
          "my-repo",
          [],
        );

        const prompt = mockCodexService.executeCodex.mock.calls[0][2];
        expect(prompt).toContain("## 추가 리뷰 지시사항");
        expect(prompt).toContain("REPO_SPECIFIC_GUIDELINE_MARKER");
      } finally {
        await rm(tmpFile, { force: true });
      }
    });

    it("should fall back to global custom prompt when repository slug is not mapped", async () => {
      const repoFile = `/tmp/test-repo-prompt-other-${Date.now()}.md`;
      const globalFile = `/tmp/test-global-prompt-${Date.now()}.md`;
      await writeFile(repoFile, "OTHER_REPO_MARKER");
      await writeFile(globalFile, "GLOBAL_GUIDELINE_MARKER");

      try {
        mockConfigService.get.mockImplementation(
          (key: string, defaultValue?: string) => {
            if (key === "codex.repoCustomPromptFilepaths") {
              return { "other-repo": repoFile };
            }
            if (key === "codex.customPromptFilepath") {
              return globalFile;
            }
            return defaultValue ?? "";
          },
        );
        mockCodexService.executeCodex.mockResolvedValueOnce({
          rawOutput: '{"summary":"ok","verdict":"approve","confidence":100,"findings":[]}',
          exitCode: 0,
          durationMs: 1,
          inputTokens: null,
          cachedInputTokens: null,
          outputTokens: null,
        });

        await (processor as unknown as ReviewProcessorWithExecuteReview).executeReview(
          "/worktree",
          "main",
          "diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n+ok",
          "my-repo",
          [],
        );

        const prompt = mockCodexService.executeCodex.mock.calls[0][2];
        expect(prompt).toContain("GLOBAL_GUIDELINE_MARKER");
        expect(prompt).not.toContain("OTHER_REPO_MARKER");
      } finally {
        await rm(repoFile, { force: true });
        await rm(globalFile, { force: true });
      }
    });

    it("should reject when the mapped per-repo prompt file is missing", async () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: string) =>
          key === "codex.repoCustomPromptFilepaths"
            ? { "my-repo": "/nonexistent/repo-prompt.md" }
            : defaultValue ?? "",
      );

      await expect(
        (processor as unknown as ReviewProcessorWithExecuteReview).executeReview(
          "/worktree",
          "main",
          "diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n+ok",
          "my-repo",
          [],
        ),
      ).rejects.toThrow(/Failed to read custom prompt file/);
    });
  });

  it("should normalize summary into Bitbucket-friendly markdown before posting", async () => {
    await (
      processor as unknown as {
        publishUnifiedResults: (
          data: IReviewJobData,
          unified: {
            summary: string;
            verdict: "approve" | "request-changes" | "comment";
            confidence: number;
            findings: ReadonlyArray<IReviewItem>;
          },
          reviewDiff: string,
          onResultCommentPublished: (commentId: number) => Promise<void>,
        ) => Promise<number | undefined>;
      }
    ).publishUnifiedResults(
      baseJobData,
      {
        summary: [
          "1) 변경 개요 - learning-trace와 bff-rtc에서 사용하지 않거나 불필요해진 데이터베이스 설정 코드를 정리했습니다.",
          "2) 주요 변경사항 - apps/learning-trace에서 DB 설정 제거 - apps/bff-rtc에서 미사용 DB 설정 제거",
          "3) 영향 범위 - 환경변수 관리 혼란이 줄어듭니다.",
        ].join(" "),
        verdict: "approve",
        confidence: 88,
        findings: [],
      },
      "",
      async () => undefined,
    );

    expect(mockBitbucketService.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("### 변경 개요"),
      }),
    );
    expect(mockBitbucketService.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("- learning-trace와 bff-rtc에서 사용하지 않거나 불필요해진 데이터베이스 설정 코드를 정리했습니다."),
      }),
    );
    expect(mockBitbucketService.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("### 주요 변경사항"),
      }),
    );
    expect(mockBitbucketService.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.not.stringContaining("1) 변경 개요"),
      }),
    );
  });

  it("should forward excluded changed files from the review diff into the Codex prompt", async () => {
    mockWorkspaceService.prepareWorktree.mockResolvedValue({
      worktreePath: "/worktree",
      bareRepoPath: "/bare",
    });
    mockWorkspaceService.cleanupWorktree.mockResolvedValue(undefined);
    mockWorkspaceService.createReviewDiff.mockResolvedValue({
      diff: "diff --git a/package.json b/package.json\n@@ -1 +1 @@\n+dep",
      excludedChangedFiles: ["M pnpm-lock.yaml"],
    });
    mockCodexService.executeCodex.mockResolvedValue({
      rawOutput: '{"summary":"ok","verdict":"approve","confidence":100,"findings":[]}',
      exitCode: 0,
      durationMs: 1,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
    });

    await processor.process({ data: baseJobData } as never);

    expect(mockCodexService.executeCodex.mock.calls[0][2]).toContain(
      "- M pnpm-lock.yaml",
    );
  });

  it("should store duration and token metrics when marking completed", async () => {
    await (
      processor as unknown as {
        markCompleted: (
          data: IReviewJobData,
          codexResult: {
            rawOutput: string;
            exitCode: number;
            durationMs: number;
            inputTokens: number | null;
            cachedInputTokens: number | null;
            outputTokens: number | null;
          },
          commentId: number | undefined,
          totalDurationMs: number,
        ) => Promise<void>;
      }
    ).markCompleted(
      baseJobData,
      {
        rawOutput: "{\"summary\":\"ok\"}",
        exitCode: 0,
        durationMs: 1200,
        inputTokens: 900,
        cachedInputTokens: 200,
        outputTokens: 80,
      },
      100,
      1500,
    );

    expect(mockReviewService.updateStatus).toHaveBeenCalledWith(
      1,
      "completed",
      expect.objectContaining({
        durationMs: 1200,
        totalDurationMs: 1500,
        inputTokens: 900,
        cachedInputTokens: 200,
        outputTokens: 80,
      }),
    );
  });

  it("should filter out findings outside the reviewed diff before posting", async () => {
    await (
      processor as unknown as {
        publishUnifiedResults: (
          data: IReviewJobData,
          unified: {
            summary: string;
            verdict: "approve" | "request-changes" | "comment";
            confidence: number;
            findings: ReadonlyArray<IReviewItem>;
          },
          reviewDiff: string,
          onResultCommentPublished: (commentId: number) => Promise<void>,
        ) => Promise<number | undefined>;
      }
    ).publishUnifiedResults(
      baseJobData,
      {
        summary: "### 변경 개요\n- Swagger Hub 변경",
        verdict: "request-changes",
        confidence: 80,
        findings: [
          {
            title: "정상 diff 파일",
            path: "tools/swagger-hub/src/main.ts",
            lineRange: { start: 12, end: 12 },
            severity: "recommended",
            description: "diff 안 이슈",
            reason: "검토 대상 파일",
          },
          {
            title: "다른 PR 문맥",
            path: "libs/base/src/constants/timezone.ts",
            lineRange: { start: 8, end: 8 },
            severity: "blocking",
            description: "diff 밖 이슈",
            reason: "이번 PR 대상 아님",
          },
        ],
      },
      [
        "diff --git a/tools/swagger-hub/src/main.ts b/tools/swagger-hub/src/main.ts",
        "+++ b/tools/swagger-hub/src/main.ts",
        "@@ -10,0 +12,1 @@",
        "+  { url: '/specs/sso-agent', name: 'SSO AGENT API' },",
      ].join("\n"),
      async () => undefined,
    );

    expect(mockBitbucketService.createInlineComment).toHaveBeenCalledTimes(1);
    expect(mockBitbucketService.createInlineComment).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: "tools/swagger-hub/src/main.ts",
        line: 12,
      }),
    );
    expect(mockBitbucketService.createInlineComment).not.toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: "libs/base/src/constants/timezone.ts",
      }),
    );
    expect(mockBitbucketService.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Recommended | 1건"),
      }),
    );
    expect(mockBitbucketService.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.not.stringContaining("Blocking | 1건"),
      }),
    );
  });

  it("persists the JSON summary comment ID before posting inline comments", async () => {
    mockWorkspaceService.prepareWorktree.mockResolvedValue({
      worktreePath: "/worktree",
      bareRepoPath: "/bare",
    });
    mockWorkspaceService.cleanupWorktree.mockResolvedValue(undefined);
    mockCodexService.executeCodex.mockResolvedValue({
      rawOutput: JSON.stringify({
        summary: "ok",
        verdict: "comment",
        confidence: 90,
        findings: [
          {
            title: "Finding",
            path: "src/app.ts",
            lineRange: { start: 1, end: 1 },
            severity: "recommended",
            description: "description",
            reason: "reason",
          },
        ],
      }),
      exitCode: 0,
      durationMs: 10,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
    });

    let releasePersistence: (() => void) | undefined;
    let signalPersistenceStarted: (() => void) | undefined;
    const persistenceBlocked = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    const persistenceStarted = new Promise<void>((resolve) => {
      signalPersistenceStarted = resolve;
    });
    mockReviewService.updateResultCommentId.mockImplementationOnce(async () => {
      signalPersistenceStarted?.();
      await persistenceBlocked;
    });

    const processing = processor.process({ data: baseJobData } as never);
    await persistenceStarted;

    expect(mockBitbucketService.createComment).toHaveBeenCalledTimes(1);
    expect(mockBitbucketService.createInlineComment).not.toHaveBeenCalled();

    releasePersistence?.();
    await processing;

    expect(mockReviewService.updateResultCommentId).toHaveBeenCalledWith(1, 100);
    const commentOrder =
      mockBitbucketService.createComment.mock.invocationCallOrder[0];
    const persistOrder =
      mockReviewService.updateResultCommentId.mock.invocationCallOrder[0];
    const inlineOrder =
      mockBitbucketService.createInlineComment.mock.invocationCallOrder[0];
    expect(commentOrder).toBeLessThan(persistOrder);
    expect(persistOrder).toBeLessThan(inlineOrder);
  });

  it("persists the raw fallback comment ID before marking the run completed", async () => {
    mockWorkspaceService.prepareWorktree.mockResolvedValue({
      worktreePath: "/worktree",
      bareRepoPath: "/bare",
    });
    mockWorkspaceService.cleanupWorktree.mockResolvedValue(undefined);
    mockCodexService.executeCodex.mockResolvedValue({
      rawOutput: "not JSON",
      exitCode: 0,
      durationMs: 10,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
    });

    let releasePersistence: (() => void) | undefined;
    let signalPersistenceStarted: (() => void) | undefined;
    const persistenceBlocked = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    const persistenceStarted = new Promise<void>((resolve) => {
      signalPersistenceStarted = resolve;
    });
    mockReviewService.updateResultCommentId.mockImplementationOnce(async () => {
      signalPersistenceStarted?.();
      await persistenceBlocked;
    });

    const processing = processor.process({ data: baseJobData } as never);
    await persistenceStarted;

    expect(mockReviewService.updateStatus).not.toHaveBeenCalledWith(
      1,
      "completed",
      expect.anything(),
    );

    releasePersistence?.();
    await processing;

    expect(mockReviewService.updateResultCommentId).toHaveBeenCalledWith(1, 100);
    const persistOrder =
      mockReviewService.updateResultCommentId.mock.invocationCallOrder[0];
    const completedCallIndex =
      mockReviewService.updateStatus.mock.calls.findIndex(
        ([, status]) => status === "completed",
      );
    const completedOrder =
      mockReviewService.updateStatus.mock.invocationCallOrder[
        completedCallIndex
      ];
    expect(
      mockBitbucketService.createComment.mock.invocationCallOrder[0],
    ).toBeLessThan(persistOrder);
    expect(persistOrder).toBeLessThan(completedOrder);
  });
});

describe("ReviewProcessor error handling", () => {
  const mockReviewService = {
    updateStatus: jest.fn(),
    updateResultCommentId: jest.fn(),
    existsByIdempotencyKey: jest.fn(),
    createReviewRun: jest.fn(),
    supersedeActivePrReviews: jest.fn(),
    findById: jest.fn(),
  };
  const mockWorkspaceService = {
    prepareWorktree: jest.fn(),
    createReviewDiff: jest.fn(),
    cleanupWorktree: jest.fn(),
  };
  const mockCodexService = {
    executeCodex: jest.fn(),
  };
  const mockBitbucketService = {
    createComment: jest.fn().mockResolvedValue({ id: 100 }),
    replyToComment: jest.fn().mockResolvedValue({ id: 101 }),
    createInlineComment: jest.fn().mockResolvedValue({ id: 102 }),
  };
  const mockConfigService = {
    get: jest.fn().mockReturnValue(""),
    getOrThrow: jest.fn(),
  };

  let processor: ReviewProcessor;

  const baseJobData: IReviewJobData = {
    reviewRunId: 1,
    repositorySlug: "my-repo",
    workspaceSlug: "my-workspace",
    pullRequestId: 42,
    headCommitHash: "abc1234",
    baseCommitHash: "def5678",
    baseBranch: "main",
    headBranch: "feature/test",
    cloneUrl: "https://bitbucket.org/my-workspace/my-repo.git",
    idempotencyKey: "my-repo:42:abc1234",
    triggerType: TriggerType.MENTION,
    triggerCommentId: 999,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigService.get.mockReturnValue("");
    mockReviewService.findById.mockResolvedValue({
      id: 1,
      reviewStatus: "preparing",
    });
    mockWorkspaceService.createReviewDiff.mockResolvedValue({
      diff: "diff --git a/src/app.ts b/src/app.ts\n+++ b/src/app.ts\n@@ -1,1 +1,1 @@\n+new line",
      excludedChangedFiles: [],
    });
    processor = new ReviewProcessor(
      mockReviewService as never,
      mockWorkspaceService as never,
      mockCodexService as never,
      mockBitbucketService as never,
      mockConfigService as never,
    );
  });

  it("should replyToComment when triggerCommentId is present", async () => {
    mockWorkspaceService.prepareWorktree.mockRejectedValue(
      new Error("workspace error"),
    );
    mockWorkspaceService.cleanupWorktree.mockResolvedValue(undefined);

    const job = { data: { ...baseJobData, triggerCommentId: 999 } } as never;

    await expect(processor.process(job)).rejects.toThrow("workspace error");

    expect(mockBitbucketService.replyToComment).toHaveBeenCalledWith(
      expect.objectContaining({
        parentCommentId: 999,
        body: expect.stringContaining("Code Review 실패"),
      }),
    );
    expect(mockBitbucketService.createComment).not.toHaveBeenCalled();
  });

  it("should createComment when triggerCommentId is undefined (auto trigger)", async () => {
    mockWorkspaceService.prepareWorktree.mockRejectedValue(
      new Error("workspace error"),
    );
    mockWorkspaceService.cleanupWorktree.mockResolvedValue(undefined);

    const job = {
      data: {
        ...baseJobData,
        triggerType: TriggerType.AUTO,
        triggerCommentId: undefined,
      },
    } as never;

    await expect(processor.process(job)).rejects.toThrow("workspace error");

    expect(mockBitbucketService.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace: "my-workspace",
        repoSlug: "my-repo",
        pullRequestId: 42,
        body: expect.stringContaining("Code Review 실패"),
      }),
    );
    expect(mockBitbucketService.replyToComment).not.toHaveBeenCalled();
  });

  it("should store available codex metrics on failure", async () => {
    mockWorkspaceService.prepareWorktree.mockResolvedValue({
      worktreePath: "/tmp/worktree",
      bareRepoPath: "/tmp/bare",
    });
    mockWorkspaceService.cleanupWorktree.mockResolvedValue(undefined);
    mockCodexService.executeCodex.mockResolvedValue({
      rawOutput:
        "Codex run failed (exit 2): Selected model is at capacity. Please try a different model.",
      exitCode: 2,
      durationMs: 2200,
      inputTokens: 1500,
      cachedInputTokens: 300,
      outputTokens: 50,
    });

    const job = { data: baseJobData } as never;

    await expect(processor.process(job)).rejects.toThrow("Codex run failed");

    expect(mockReviewService.updateStatus).toHaveBeenCalledWith(
      1,
      "failed",
      expect.objectContaining({
        durationMs: 2200,
        inputTokens: 1500,
        cachedInputTokens: 300,
        outputTokens: 50,
        totalDurationMs: expect.any(Number),
        errorMessage: expect.stringContaining("Codex run failed"),
      }),
    );
    expect(mockBitbucketService.replyToComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining(
          "Selected model is at capacity. Please try a different model.",
        ),
      }),
    );
  });

  it("should defer failure reporting while retries remain", async () => {
    mockWorkspaceService.prepareWorktree.mockRejectedValue(
      new Error("Git clone failed"),
    );
    mockWorkspaceService.cleanupWorktree.mockResolvedValue(undefined);

    const job = {
      data: baseJobData,
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as never;

    await expect(processor.process(job)).rejects.toThrow("Git clone failed");

    expect(mockReviewService.updateStatus).not.toHaveBeenCalledWith(
      1,
      "failed",
      expect.anything(),
    );
    expect(mockBitbucketService.replyToComment).not.toHaveBeenCalled();
    expect(mockBitbucketService.createComment).not.toHaveBeenCalled();
  });

  it("should report failure on the last attempt", async () => {
    mockWorkspaceService.prepareWorktree.mockRejectedValue(
      new Error("Git clone failed"),
    );
    mockWorkspaceService.cleanupWorktree.mockResolvedValue(undefined);

    const job = {
      data: baseJobData,
      attemptsMade: 2,
      opts: { attempts: 3 },
    } as never;

    await expect(processor.process(job)).rejects.toThrow("Git clone failed");

    expect(mockReviewService.updateStatus).toHaveBeenCalledWith(
      1,
      "failed",
      expect.objectContaining({
        errorMessage: expect.stringContaining("Git clone failed"),
      }),
    );
    expect(mockBitbucketService.replyToComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Code Review 실패"),
      }),
    );
  });

  it("preserves the comment ID in FAILED metadata when markCompleted fails", async () => {
    mockWorkspaceService.prepareWorktree.mockResolvedValue({
      worktreePath: "/tmp/worktree",
      bareRepoPath: "/tmp/bare",
    });
    mockWorkspaceService.cleanupWorktree.mockResolvedValue(undefined);
    mockCodexService.executeCodex.mockResolvedValue({
      rawOutput:
        '{"summary":"ok","verdict":"approve","confidence":100,"findings":[]}',
      exitCode: 0,
      durationMs: 10,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
    });
    mockReviewService.updateStatus.mockImplementation(
      (_id: number, status: string) =>
        status === "completed"
          ? Promise.reject(new Error("db unavailable"))
          : Promise.resolve(undefined),
    );

    const job = {
      data: baseJobData,
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as never;

    // 재시도하면 summary/inline 코멘트가 중복 게시된다 → UnrecoverableError로 차단
    await expect(processor.process(job)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect(mockBitbucketService.createComment).toHaveBeenCalledTimes(1);
    expect(mockReviewService.updateStatus).toHaveBeenCalledWith(
      1,
      "failed",
      expect.objectContaining({
        resultCommentId: 100,
        errorMessage: expect.stringContaining("db unavailable"),
      }),
    );
    expect(mockReviewService.updateResultCommentId).toHaveBeenCalledWith(1, 100);
  });

  it.each([
    { name: "superseded by a newer run", run: { id: 1, reviewStatus: "superseded" } },
    { name: "deleted", run: null },
  ])("should skip a retry whose run was $name", async ({ run }) => {
    mockReviewService.findById.mockResolvedValue(run);

    const job = {
      data: baseJobData,
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as never;

    await expect(processor.process(job)).resolves.toBeUndefined();

    // 구버전 커밋 리뷰가 새 리뷰 뒤에 게시되면 안 된다
    expect(mockWorkspaceService.prepareWorktree).not.toHaveBeenCalled();
    expect(mockCodexService.executeCodex).not.toHaveBeenCalled();
    expect(mockBitbucketService.createComment).not.toHaveBeenCalled();
    expect(mockReviewService.updateStatus).not.toHaveBeenCalled();
  });

  it("should report failure when the retry precheck lookup fails on the last attempt", async () => {
    mockReviewService.findById.mockRejectedValue(new Error("db unavailable"));
    mockWorkspaceService.cleanupWorktree.mockResolvedValue(undefined);

    const job = {
      data: baseJobData,
      attemptsMade: 2,
      opts: { attempts: 3 },
    } as never;

    await expect(processor.process(job)).rejects.toThrow("db unavailable");

    // 조회 실패가 최종 실패 보고를 건너뛰면 런이 preparing으로 영구 잔류한다
    expect(mockReviewService.updateStatus).toHaveBeenCalledWith(
      1,
      "failed",
      expect.objectContaining({
        errorMessage: expect.stringContaining("db unavailable"),
      }),
    );
    expect(mockBitbucketService.replyToComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Code Review 실패"),
      }),
    );
  });

  it("should stay retriable when the publishing status update fails", async () => {
    mockWorkspaceService.prepareWorktree.mockResolvedValue({
      worktreePath: "/tmp/worktree",
      bareRepoPath: "/tmp/bare",
    });
    mockWorkspaceService.cleanupWorktree.mockResolvedValue(undefined);
    mockCodexService.executeCodex.mockResolvedValue({
      rawOutput:
        '{"summary":"ok","verdict":"approve","confidence":100,"findings":[]}',
      exitCode: 0,
      durationMs: 10,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
    });
    // Bitbucket 쓰기 전 DB 전이 실패 — 재시도해도 중복 게시 위험이 없다
    mockReviewService.updateStatus.mockImplementation(
      (_id: number, status: string) =>
        status === "publishing"
          ? Promise.reject(new Error("db unavailable"))
          : Promise.resolve(undefined),
    );

    const job = {
      data: baseJobData,
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as never;

    const rejection = await processor.process(job).catch((err) => err);

    expect(rejection).not.toBeInstanceOf(UnrecoverableError);
    expect((rejection as Error).message).toContain("db unavailable");
    expect(mockBitbucketService.createComment).not.toHaveBeenCalled();
  });

  it("should stay unrecoverable when persisting the failed status also fails", async () => {
    mockWorkspaceService.prepareWorktree.mockResolvedValue({
      worktreePath: "/tmp/worktree",
      bareRepoPath: "/tmp/bare",
    });
    mockWorkspaceService.cleanupWorktree.mockResolvedValue(undefined);
    mockCodexService.executeCodex.mockResolvedValue({
      rawOutput:
        '{"summary":"ok","verdict":"approve","confidence":100,"findings":[]}',
      exitCode: 0,
      durationMs: 10,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
    });
    // DB 장애: markCompleted도, 뒤따르는 FAILED 기록도 실패한다
    mockReviewService.updateStatus.mockImplementation(
      (_id: number, status: string) =>
        status === "completed" || status === "failed"
          ? Promise.reject(new Error("db unavailable"))
          : Promise.resolve(undefined),
    );

    const job = {
      data: baseJobData,
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as never;

    await expect(processor.process(job)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect(mockBitbucketService.createComment).toHaveBeenCalledTimes(1);
  });

  it("preserves the process-local comment ID when its early persistence fails", async () => {
    mockWorkspaceService.prepareWorktree.mockResolvedValue({
      worktreePath: "/tmp/worktree",
      bareRepoPath: "/tmp/bare",
    });
    mockWorkspaceService.cleanupWorktree.mockResolvedValue(undefined);
    mockCodexService.executeCodex.mockResolvedValue({
      rawOutput:
        '{"summary":"ok","verdict":"approve","confidence":100,"findings":[]}',
      exitCode: 0,
      durationMs: 10,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
    });
    mockReviewService.updateStatus.mockResolvedValue(undefined);
    mockReviewService.updateResultCommentId.mockRejectedValue(
      new Error("comment ID persistence unavailable"),
    );

    const job = {
      data: baseJobData,
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as never;

    await expect(processor.process(job)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect(mockReviewService.updateStatus).toHaveBeenCalledWith(
      1,
      "failed",
      expect.objectContaining({
        resultCommentId: 100,
        errorMessage: expect.stringContaining(
          "comment ID persistence unavailable",
        ),
      }),
    );
  });

  it("keeps PUBLISHING when comment ID and FAILED persistence both fail", async () => {
    mockWorkspaceService.prepareWorktree.mockResolvedValue({
      worktreePath: "/tmp/worktree",
      bareRepoPath: "/tmp/bare",
    });
    mockWorkspaceService.cleanupWorktree.mockResolvedValue(undefined);
    mockCodexService.executeCodex.mockResolvedValue({
      rawOutput:
        '{"summary":"ok","verdict":"approve","confidence":100,"findings":[]}',
      exitCode: 0,
      durationMs: 10,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
    });
    const persistedStatuses: string[] = [];
    mockReviewService.updateStatus.mockImplementation(
      (_id: number, status: string) => {
        if (
          status === "preparing" ||
          status === "reviewing" ||
          status === "publishing"
        ) {
          persistedStatuses.push(status);
          return Promise.resolve(undefined);
        }
        if (status === "failed") {
          return Promise.reject(new Error("FAILED persistence unavailable"));
        }
        return Promise.reject(new Error(`unexpected status: ${status}`));
      },
    );
    mockReviewService.updateResultCommentId.mockRejectedValue(
      new Error("comment ID persistence unavailable"),
    );

    const job = {
      data: baseJobData,
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as never;

    await expect(processor.process(job)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect(mockReviewService.updateResultCommentId).toHaveBeenCalledWith(1, 100);
    expect(mockBitbucketService.createComment).toHaveBeenCalledTimes(1);
    expect(mockReviewService.updateStatus).toHaveBeenCalledWith(
      1,
      "failed",
      expect.objectContaining({
        resultCommentId: 100,
      }),
    );
    expect(persistedStatuses).toEqual(["preparing", "publishing"]);
  });
});
