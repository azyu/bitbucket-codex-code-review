import type { RepoStats } from "./wire";

export type RepoSortKey =
  | "repository"
  | "runs"
  | "success"
  | "codexAvg"
  | "reviewAvg"
  | "tokens"
  | "latest";

export type SortDir = "asc" | "desc";

export type RepoSort = { key: RepoSortKey; dir: SortDir };

/**
 * null means the cell renders "—". Those rows sink to the bottom in both
 * directions: a repository with no runs is not the best or worst success rate,
 * and letting it lead an ascending sort would bury the real worst one.
 */
const VALUE: Record<RepoSortKey, (r: RepoStats) => string | number | null> = {
  repository: (r) => `${r.workspaceSlug}/${r.repoSlug}`,
  runs: (r) => r.counts.total,
  success: (r) => (r.counts.total > 0 ? r.counts.completed / r.counts.total : null),
  // duration() and tokens() render 0 as "—", so 0 is absent here too.
  codexAvg: (r) => (r.durations.codexAvgMs > 0 ? r.durations.codexAvgMs : null),
  reviewAvg: (r) => (r.durations.reviewAvgMs > 0 ? r.durations.reviewAvgMs : null),
  tokens: (r) => (r.tokens.totalTokens > 0 ? r.tokens.totalTokens : null),
  latest: (r) => (r.latestReview === null ? null : Date.parse(r.latestReview.createdAt)),
};

const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

function compare(a: string | number, b: string | number): number {
  return typeof a === "string" ? collator.compare(a, b as string) : a - (b as number);
}

/** Text columns start ascending; numbers start with the largest. */
export function firstDir(key: RepoSortKey): SortDir {
  return key === "repository" ? "asc" : "desc";
}

export function nextSort(current: RepoSort, key: RepoSortKey): RepoSort {
  if (current.key !== key) return { key, dir: firstDir(key) };
  return { key, dir: current.dir === "asc" ? "desc" : "asc" };
}

export function sortRepos(repos: readonly RepoStats[], { key, dir }: RepoSort): RepoStats[] {
  const value = VALUE[key];
  const name = VALUE.repository;
  const sign = dir === "asc" ? 1 : -1;
  return [...repos].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1;
    } else {
      const c = compare(va, vb);
      if (c !== 0) return sign * c;
    }
    // Ties keep a stable, readable order instead of the response order.
    return compare(name(a)!, name(b)!);
  });
}
