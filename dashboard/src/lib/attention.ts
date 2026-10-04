import { ReviewRunStatus } from "../../../src/review/review.types";
import type { RepoStats } from "./wire";

/**
 * Measured from the run's createdAt — the API carries no "entered this stage
 * at" time — so it is wall time since the run was queued, retries included.
 */
export const LONG_RUNNING_MS = 30 * 60_000;

const IN_FLIGHT: ReadonlySet<string> = new Set([
  ReviewRunStatus.QUEUED,
  ReviewRunStatus.PREPARING,
  ReviewRunStatus.REVIEWING,
  ReviewRunStatus.PUBLISHING,
]);

export type AttentionKind = "failed" | "longRunning" | "inFlight";

export type AttentionItem = {
  kind: AttentionKind;
  repo: RepoStats & { latestReview: NonNullable<RepoStats["latestReview"]> };
};

const RANK: Record<AttentionKind, number> = { failed: 0, longRunning: 1, inFlight: 2 };

/**
 * Repositories whose latest run failed or has not finished. Built from the
 * per-repository latest run rather than from recent reviews: at the default
 * limit the recent list covers a handful of busy repositories, so a failure on
 * a quiet one would otherwise show nowhere above the fold.
 */
export function needsAttention(
  repos: readonly RepoStats[],
  now: number = Date.now(),
): AttentionItem[] {
  const items: (AttentionItem & { at: number })[] = [];
  for (const repo of repos) {
    const latest = repo.latestReview;
    if (latest === null) continue;
    const at = Date.parse(latest.createdAt);
    let kind: AttentionKind;
    if (latest.reviewStatus === ReviewRunStatus.FAILED) kind = "failed";
    else if (!IN_FLIGHT.has(latest.reviewStatus)) continue;
    else kind = now - at > LONG_RUNNING_MS ? "longRunning" : "inFlight";
    items.push({ kind, repo: { ...repo, latestReview: latest }, at });
  }
  items.sort((a, b) => RANK[a.kind] - RANK[b.kind] || b.at - a.at);
  return items.map(({ kind, repo }) => ({ kind, repo }));
}

/**
 * Same host the worker clones from (webhook.controller.ts): the service only
 * talks to Bitbucket Cloud.
 */
export function pullRequestUrl(workspaceSlug: string, repositorySlug: string, id: number): string {
  return `https://bitbucket.org/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(repositorySlug)}/pull-requests/${id}`;
}
