import { describe, expect, it } from "vitest";
import { ReviewRunStatus } from "../../../src/review/review.types";
import { LONG_RUNNING_MS, needsAttention, pullRequestUrl } from "./attention";
import type { RepoStats } from "./wire";

const NOW = Date.parse("2026-10-04T05:00:00Z");

function repo(repoSlug: string, status: ReviewRunStatus | null, minutesAgo = 1): RepoStats {
  return {
    workspaceSlug: "ws",
    repoSlug,
    counts: { total: 1, completed: 0, failed: 0, superseded: 0 },
    durations: { codexTotalMs: 0, codexAvgMs: 0, reviewTotalMs: 0, reviewAvgMs: 0, reviewSampleCount: 0 },
    tokens: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0 },
    latestReview:
      status === null
        ? null
        : {
            id: repoSlug.length,
            workspaceSlug: "ws",
            repositorySlug: repoSlug,
            pullRequestId: 1,
            reviewStatus: status,
            durationMs: null,
            totalDurationMs: null,
            inputTokens: null,
            cachedInputTokens: null,
            outputTokens: null,
            createdAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
          },
  };
}

describe("needsAttention", () => {
  it("keeps failed and in-flight latest runs and drops settled ones", () => {
    const list = needsAttention(
      [
        repo("done", ReviewRunStatus.COMPLETED),
        repo("replaced", ReviewRunStatus.SUPERSEDED),
        repo("never", null),
        repo("broken", ReviewRunStatus.FAILED),
        repo("queued", ReviewRunStatus.QUEUED),
        repo("posting", ReviewRunStatus.PUBLISHING),
      ],
      NOW,
    );

    expect(list.map((item) => item.repo.repoSlug).sort()).toEqual(["broken", "posting", "queued"]);
  });

  // A run reviewing for an hour is closer to a failure than to one that just
  // started, so it ranks with the failures instead of trailing the queue.
  it("ranks failed, then long-running, then recently started — newest first within each", () => {
    const list = needsAttention(
      [
        repo("fresh", ReviewRunStatus.REVIEWING, 2),
        repo("old-failure", ReviewRunStatus.FAILED, 600),
        repo("slow", ReviewRunStatus.REVIEWING, 45),
        repo("new-failure", ReviewRunStatus.FAILED, 5),
      ],
      NOW,
    );

    expect(list.map((item) => [item.repo.repoSlug, item.kind])).toEqual([
      ["new-failure", "failed"],
      ["old-failure", "failed"],
      ["slow", "longRunning"],
      ["fresh", "inFlight"],
    ]);
  });

  it("flags a run as long-running only once it is past the threshold", () => {
    const minutes = LONG_RUNNING_MS / 60_000;
    const [atLimit] = needsAttention([repo("a", ReviewRunStatus.QUEUED, minutes)], NOW);
    const [past] = needsAttention([repo("b", ReviewRunStatus.QUEUED, minutes + 1)], NOW);

    expect(atLimit!.kind).toBe("inFlight");
    expect(past!.kind).toBe("longRunning");
  });
});

describe("pullRequestUrl", () => {
  it("points at the Bitbucket Cloud pull request page", () => {
    expect(pullRequestUrl("locomotivelabs", "billing-service", 412)).toBe(
      "https://bitbucket.org/locomotivelabs/billing-service/pull-requests/412",
    );
  });

  // The slugs come from webhook payloads; a stray "/" or "?" must not move the
  // link to another repository or append a query.
  it("encodes each slug as one path segment", () => {
    expect(pullRequestUrl("a/b", "c?d", 1)).toBe(
      "https://bitbucket.org/a%2Fb/c%3Fd/pull-requests/1",
    );
  });
});
