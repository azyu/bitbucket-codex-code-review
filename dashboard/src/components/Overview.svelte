<script lang="ts">
  import { count, duration, percent, relativeTime, shortSha, tokens } from "../lib/format";
  import { t } from "../lib/i18n.svelte";
  import { store } from "../lib/store.svelte";
  import StatusBadge from "./StatusBadge.svelte";

  const LIMITS = [10, 25, 50];

  let totals = $derived.by(() => {
    const seed = {
      total: 0,
      completed: 0,
      failed: 0,
      superseded: 0,
      reviewTotalMs: 0,
      reviewSampleCount: 0,
      totalTokens: 0,
    };
    for (const repo of store.repoStats) {
      seed.total += repo.counts.total;
      seed.completed += repo.counts.completed;
      seed.failed += repo.counts.failed;
      seed.superseded += repo.counts.superseded;
      seed.reviewTotalMs += repo.durations.reviewTotalMs;
      seed.reviewSampleCount += repo.durations.reviewSampleCount;
      seed.totalTokens += repo.tokens.totalTokens;
    }
    return seed;
  });

  // Every row of both tables carries the same "locomotivelabs/" otherwise. The
  // prefix comes back the moment a second workspace shows up, so nothing is
  // lost when the deployment stops being single-tenant. Both lists feed the
  // check: recent is not a strict subset of repoStats — the two are separate
  // responses, so a repository could reach one before the other.
  let sharedWorkspace = $derived.by(() => {
    const all = new Set([
      ...store.repoStats.map((r) => r.workspaceSlug),
      ...store.recent.map((r) => r.workspaceSlug),
    ]);
    return all.size === 1 ? [...all][0] : null;
  });

  function repoLabel(workspaceSlug: string, repoSlug: string): string {
    return sharedWorkspace === null ? `${workspaceSlug}/${repoSlug}` : repoSlug;
  }

  let ranked = $derived(
    [...store.repoStats].sort((a, b) => b.counts.total - a.counts.total),
  );
</script>

<section class="tiles">
  <div class="card tile">
    <span class="dim">{t("overview.runs")}</span>
    <strong>{count(totals.total)}</strong>
    <span class="dim">
      {t("overview.repositories", { count: store.repoStats.length })}
    </span>
  </div>
  <div class="card tile">
    <span class="dim">{t("overview.completed")}</span>
    <strong class="ok">{count(totals.completed)}</strong>
    <span class="dim">
      {t("overview.ofRuns", {
        percent: percent(totals.completed, totals.total),
      })}
    </span>
  </div>
  <div class="card tile">
    <span class="dim">{t("overview.failed")}</span>
    <strong class:bad={totals.failed > 0}>{count(totals.failed)}</strong>
    <span class="dim">
      {t("overview.superseded", { count: count(totals.superseded) })}
    </span>
  </div>
  <div class="card tile">
    <span class="dim">{t("overview.reviewTime")}</span>
    <strong>{duration(totals.reviewTotalMs)}</strong>
    <span class="dim">
      <!-- Divided by the runs that actually reported a duration, which is
           what the backend's AVG(totalDurationMs) counts. Using counts.total
           would understate the average while runs are queued or running. -->
      {t("overview.average", {
        duration: duration(
          totals.reviewSampleCount > 0
            ? totals.reviewTotalMs / totals.reviewSampleCount
            : 0,
        ),
      })}
    </span>
  </div>
  <div class="card tile">
    <span class="dim">{t("overview.tokens")}</span>
    <strong>{tokens(totals.totalTokens)}</strong>
    <span class="dim">{t("overview.inputOutput")}</span>
  </div>
</section>

<section>
  <h2>
    {t("overview.reposHeading")}
    {#if sharedWorkspace !== null}<span class="ws mono">{sharedWorkspace}</span
      >{/if}
  </h2>
  {#if ranked.length === 0}
    <p class="card empty dim">{t("overview.noRuns")}</p>
  {:else}
    <div class="card scroll">
      <table>
        <thead>
          <tr>
            <th>{t("column.repository")}</th>
            <th>{t("column.status")}</th>
            <th class="num">{t("overview.runCount")}</th>
            <th class="num">{t("overview.success")}</th>
            <th class="num">{t("overview.codexAvg")}</th>
            <th class="num">{t("overview.reviewAvg")}</th>
            <th class="num">{t("column.tokens")}</th>
            <th>{t("overview.latestPr")}</th>
          </tr>
        </thead>
        <tbody>
          {#each ranked as repo (repo.workspaceSlug + "/" + repo.repoSlug)}
            <tr>
              <td class="mono">
                {repoLabel(repo.workspaceSlug, repo.repoSlug)}
              </td>
              <!-- Recent reviews does not stand in for this: at the default
                   limit its ten rows came from two of the 31 repositories, so
                   a queued or failed run on any of the other 29 would appear
                   nowhere on the page. -->
              <td>
                {#if repo.latestReview !== null}
                  <StatusBadge status={repo.latestReview.reviewStatus} />
                {:else}
                  <span class="dim">—</span>
                {/if}
              </td>
              <td class="num">{count(repo.counts.total)}</td>
              <!-- The failed and superseded counts have no column of their own.
                   A title would carry them only to a mouse — a td takes no
                   focus and a touch screen has no hover — so they ride along
                   as text the cell's accessible name includes. -->
              <td class="num">
                {percent(repo.counts.completed, repo.counts.total)}
                <span class="sr-only">
                  {t("overview.breakdown", {
                    completed: repo.counts.completed,
                    failed: repo.counts.failed,
                    superseded: repo.counts.superseded,
                  })}
                </span>
              </td>
              <td class="num">{duration(repo.durations.codexAvgMs)}</td>
              <td class="num">{duration(repo.durations.reviewAvgMs)}</td>
              <td class="num">{tokens(repo.tokens.totalTokens)}</td>
              <td>
                {#if repo.latestReview !== null}
                  <button
                    class="link"
                    onclick={() => store.openReview(repo.latestReview!.id)}
                  >
                    #{repo.latestReview.pullRequestId}
                  </button>
                  <span class="dim">
                    · {relativeTime(repo.latestReview.createdAt)}
                  </span>
                {:else}
                  <span class="dim">—</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<section>
  <div class="section-head">
    <h2>
      {t("overview.recent")}
      {#if sharedWorkspace !== null}<span class="ws mono">{sharedWorkspace}</span
        >{/if}
    </h2>
    <div class="limits">
      {#each LIMITS as limit (limit)}
        <button
          class:on={store.recentLimit === limit}
          disabled={store.loading}
          onclick={() => store.setRecentLimit(limit)}>{limit}</button
        >
      {/each}
    </div>
  </div>

  {#if store.recent.length === 0}
    <p class="card empty dim">{t("overview.nothingYet")}</p>
  {:else}
    <div class="card scroll">
      <table>
        <thead>
          <tr>
            <th>{t("column.status")}</th>
            <th>{t("column.repository")}</th>
            <th>{t("column.pr")}</th>
            <th>{t("column.head")}</th>
            <th>{t("column.trigger")}</th>
            <th>{t("column.model")}</th>
            <th>{t("column.codex")}</th>
            <th>{t("column.total")}</th>
            <th>{t("column.tokens")}</th>
            <th>{t("column.when")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each store.recent as review (review.id)}
            <tr>
              <td><StatusBadge status={review.reviewStatus} /></td>
              <td class="mono">
                {repoLabel(review.workspaceSlug, review.repositorySlug)}
              </td>
              <td>#{review.pullRequestId}</td>
              <td class="mono dim">{shortSha(review.headCommitHash)}</td>
              <td class="dim">{review.triggerType}</td>
              <td class="dim">
                {review.codexModel ?? "—"}{review.codexReasoningEffort
                  ? ` / ${review.codexReasoningEffort}`
                  : ""}
              </td>
              <td>{duration(review.durationMs)}</td>
              <td>{duration(review.totalDurationMs)}</td>
              <!-- input + output, the definition review.service.ts uses for
                   totalTokens. cachedInputTokens is the cached share of
                   inputTokens, so adding it counts those tokens twice. -->
              <td title={t("overview.inputOutput")}>
                {tokens((review.inputTokens ?? 0) + (review.outputTokens ?? 0))}
              </td>
              <td class="dim" title={review.createdAt}>
                {relativeTime(review.createdAt)}
              </td>
              <td>
                <button class="link" onclick={() => store.openReview(review.id)}>
                  {t("action.open")}
                </button>
              </td>
            </tr>
            {#if review.errorMessage}
              <tr class="err">
                <td></td>
                <td colspan="10" class="mono">{review.errorMessage}</td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  h2 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-dim);
    margin-bottom: 10px;
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .limits {
    display: flex;
    gap: 4px;
    margin-bottom: 10px;
  }

  .limits button {
    padding: 3px 10px;
    font-size: 12px;
    color: var(--text-dim);
  }

  .limits button.on {
    color: var(--text);
    font-weight: 600;
    background: var(--surface-2);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 12px;
  }

  .tile {
    padding: 14px 16px;
    display: grid;
    gap: 2px;
  }

  .tile span {
    font-size: 11.5px;
  }

  .tile strong {
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .ok {
    color: var(--ok);
  }

  .bad {
    color: var(--bad);
  }

  /* The workspace slug lives beside the heading instead of on every row, so
     it must opt out of the heading's uppercase tracking. */
  .ws {
    margin-left: 8px;
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }

  th.num,
  td.num {
    text-align: right;
  }

  /* Reaches a screen reader without reaching the layout. */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .empty {
    padding: 22px;
    text-align: center;
    margin: 0;
  }

  .scroll {
    overflow-x: auto;
  }

  td {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  tr.err td {
    border-bottom: none;
    padding-top: 0;
    color: var(--bad);
    font-size: 12px;
    white-space: normal;
  }

  .link {
    border: none;
    background: none;
    padding: 0;
    color: var(--accent);
    font-weight: 600;
  }

  .link:hover {
    background: none;
    text-decoration: underline;
  }
</style>
