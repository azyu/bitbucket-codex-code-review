import { describe, expect, it } from "vitest";
import { ReviewRunStatus } from "../../../src/review/review.types";
import { nextSort, sortRepos } from "./sort";
import type { RepoStats } from "./wire";

function repo(
  repoSlug: string,
  total: number,
  completed: number,
  latest: string | null = null,
): RepoStats {
  return {
    workspaceSlug: "ws",
    repoSlug,
    counts: { total, completed, failed: total - completed, superseded: 0 },
    durations: {
      codexTotalMs: 0,
      codexAvgMs: total > 0 ? 1000 * total : 0,
      reviewTotalMs: 0,
      reviewAvgMs: 0,
      reviewSampleCount: 0,
    },
    tokens: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: total },
    latestReview:
      latest === null
        ? null
        : {
            id: 1,
            workspaceSlug: "ws",
            repositorySlug: repoSlug,
            pullRequestId: 1,
            reviewStatus: ReviewRunStatus.COMPLETED,
            durationMs: null,
            totalDurationMs: null,
            inputTokens: null,
            cachedInputTokens: null,
            outputTokens: null,
            createdAt: latest,
          },
  };
}

const slugs = (rows: RepoStats[]) => rows.map((r) => r.repoSlug);

describe("sortRepos", () => {
  const rows = [
    repo("repo-10", 4, 2, "2026-09-01T00:00:00Z"),
    repo("idle", 0, 0),
    repo("repo-2", 10, 9, "2026-09-03T00:00:00Z"),
    repo("Alpha", 4, 4, "2026-09-02T00:00:00Z"),
  ];

  it("orders names naturally and case-insensitively", () => {
    expect(slugs(sortRepos(rows, { key: "repository", dir: "asc" }))).toEqual([
      "Alpha",
      "idle",
      "repo-2",
      "repo-10",
    ]);
    expect(slugs(sortRepos(rows, { key: "repository", dir: "desc" }))).toEqual([
      "repo-10",
      "repo-2",
      "idle",
      "Alpha",
    ]);
  });

  it("breaks numeric ties by name", () => {
    expect(slugs(sortRepos(rows, { key: "runs", dir: "desc" }))).toEqual([
      "repo-2",
      "Alpha",
      "repo-10",
      "idle",
    ]);
  });

  it("keeps a repository without runs last in both directions", () => {
    expect(slugs(sortRepos(rows, { key: "success", dir: "asc" }))).toEqual([
      "repo-10",
      "repo-2",
      "Alpha",
      "idle",
    ]);
    expect(slugs(sortRepos(rows, { key: "success", dir: "desc" }))).toEqual([
      "Alpha",
      "repo-2",
      "repo-10",
      "idle",
    ]);
    expect(slugs(sortRepos(rows, { key: "codexAvg", dir: "asc" })).at(-1)).toBe("idle");
    expect(slugs(sortRepos(rows, { key: "latest", dir: "asc" })).at(-1)).toBe("idle");
    // tokens() renders 0 as "—", so a zero total is absent, not the smallest.
    expect(slugs(sortRepos(rows, { key: "tokens", dir: "asc" })).at(-1)).toBe("idle");
  });

  it("sorts the latest PR by time", () => {
    expect(slugs(sortRepos(rows, { key: "latest", dir: "desc" }))).toEqual([
      "repo-2",
      "Alpha",
      "repo-10",
      "idle",
    ]);
  });

  it("does not mutate its input", () => {
    const before = slugs(rows);
    sortRepos(rows, { key: "repository", dir: "asc" });
    expect(slugs(rows)).toEqual(before);
  });
});

describe("nextSort", () => {
  it("toggles the active column and starts a new one at its natural direction", () => {
    expect(nextSort({ key: "runs", dir: "desc" }, "runs")).toEqual({ key: "runs", dir: "asc" });
    expect(nextSort({ key: "runs", dir: "asc" }, "runs")).toEqual({ key: "runs", dir: "desc" });
    expect(nextSort({ key: "runs", dir: "desc" }, "repository")).toEqual({
      key: "repository",
      dir: "asc",
    });
    expect(nextSort({ key: "repository", dir: "asc" }, "tokens")).toEqual({
      key: "tokens",
      dir: "desc",
    });
  });
});
