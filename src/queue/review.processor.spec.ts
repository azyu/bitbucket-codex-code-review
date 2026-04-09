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
import { TriggerType } from "../entities/review-run.entity";
import { IReviewJobData } from "./interfaces/queue.interfaces";

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
  it("should build a prompt string containing baseBranch", () => {
    const prompt = buildReviewPrompt("main");

    expect(prompt).toContain("'main'");
    expect(prompt).toContain("버그 판정 기준");
    expect(prompt).toContain("line_range");
    expect(prompt).toContain("severity");
    expect(prompt).toContain("title");
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
    existsByIdempotencyKey: jest.fn(),
    createReviewRun: jest.fn(),
    supersedeActivePrReviews: jest.fn(),
  };
  const mockWorkspaceService = {
    prepareWorktree: jest.fn(),
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
    processor = new ReviewProcessor(
      mockReviewService as never,
      mockWorkspaceService as never,
      mockCodexService as never,
      mockBitbucketService as never,
      mockConfigService as never,
    );
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
        ) => Promise<number | undefined>;
      }
    ).publishUnifiedResults(baseJobData, {
      summary: [
        "1) 변경 개요 - learning-trace와 bff-rtc에서 사용하지 않거나 불필요해진 데이터베이스 설정 코드를 정리했습니다.",
        "2) 주요 변경사항 - apps/learning-trace에서 DB 설정 제거 - apps/bff-rtc에서 미사용 DB 설정 제거",
        "3) 영향 범위 - 환경변수 관리 혼란이 줄어듭니다.",
      ].join(" "),
      verdict: "approve",
      confidence: 88,
      findings: [],
    });

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
});

describe("ReviewProcessor error handling", () => {
  const mockReviewService = {
    updateStatus: jest.fn(),
    existsByIdempotencyKey: jest.fn(),
    createReviewRun: jest.fn(),
    supersedeActivePrReviews: jest.fn(),
  };
  const mockWorkspaceService = {
    prepareWorktree: jest.fn(),
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
      rawOutput: "codex failed",
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
  });
});
