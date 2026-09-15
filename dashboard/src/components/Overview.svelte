<script lang="ts">
  import { count, duration, percent, relativeTime, shortSha, tokens } from "../lib/format";
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

  let ranked = $derived(
    [...store.repoStats].sort((a, b) => b.counts.total - a.counts.total),
  );
</script>

<section class="tiles">
  <div class="card tile">
    <span class="dim">Review runs</span>
    <strong>{count(totals.total)}</strong>
    <span class="dim">{store.repoStats.length} repositories</span>
  </div>
  <div class="card tile">
    <span class="dim">Completed</span>
    <strong class="ok">{count(totals.completed)}</strong>
    <span class="dim">{percent(totals.completed, totals.total)} of runs</span>
  </div>
  <div class="card tile">
    <span class="dim">Failed</span>
    <strong class:bad={totals.failed > 0}>{count(totals.failed)}</strong>
    <span class="dim">{count(totals.superseded)} superseded</span>
  </div>
  <div class="card tile">
    <span class="dim">Review time</span>
    <strong>{duration(totals.reviewTotalMs)}</strong>
    <span class="dim">
      <!-- Divided by the runs that actually reported a duration, which is
           what the backend's AVG(totalDurationMs) counts. Using counts.total
           would understate the average while runs are queued or running. -->
      {duration(
        totals.reviewSampleCount > 0
          ? totals.reviewTotalMs / totals.reviewSampleCount
          : 0,
      )} avg
    </span>
  </div>
  <div class="card tile">
    <span class="dim">Tokens</span>
    <strong>{tokens(totals.totalTokens)}</strong>
    <span class="dim">input + output</span>
  </div>
</section>

<section>
  <h2>Repositories</h2>
  {#if ranked.length === 0}
    <p class="card empty dim">No review runs recorded yet.</p>
  {:else}
    <div class="repos">
      {#each ranked as repo (repo.workspaceSlug + "/" + repo.repoSlug)}
        <article class="card repo">
          <header>
            <span class="mono">{repo.workspaceSlug}/{repo.repoSlug}</span>
            {#if repo.latestReview !== null}
              <StatusBadge status={repo.latestReview.reviewStatus} />
            {/if}
          </header>

          <div
            class="bar"
            role="img"
            aria-label="{repo.counts.completed} completed, {repo.counts.failed} failed, {repo.counts.superseded} superseded"
          >
            <span class="seg ok" style:flex={repo.counts.completed || 0}></span>
            <span class="seg bad" style:flex={repo.counts.failed || 0}></span>
            <span class="seg mute" style:flex={repo.counts.superseded || 0}></span>
          </div>

          <dl>
            <div><dt>Runs</dt><dd>{count(repo.counts.total)}</dd></div>
            <div>
              <dt>Success</dt>
              <dd>{percent(repo.counts.completed, repo.counts.total)}</dd>
            </div>
            <div><dt>Codex avg</dt><dd>{duration(repo.durations.codexAvgMs)}</dd></div>
            <div><dt>Review avg</dt><dd>{duration(repo.durations.reviewAvgMs)}</dd></div>
            <div><dt>Tokens</dt><dd>{tokens(repo.tokens.totalTokens)}</dd></div>
            <div>
              <dt>Cached in</dt>
              <dd>{tokens(repo.tokens.cachedInputTokens)}</dd>
            </div>
          </dl>

          {#if repo.latestReview !== null}
            <footer class="dim">
              Latest PR
              <button class="link" onclick={() => store.openReview(repo.latestReview!.id)}>
                #{repo.latestReview.pullRequestId}
              </button>
              · {relativeTime(repo.latestReview.createdAt)}
            </footer>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</section>

<section>
  <div class="section-head">
    <h2>Recent reviews</h2>
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
    <p class="card empty dim">Nothing yet.</p>
  {:else}
    <div class="card scroll">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Repository</th>
            <th>PR</th>
            <th>Head</th>
            <th>Trigger</th>
            <th>Model</th>
            <th>Codex</th>
            <th>Total</th>
            <th>Tokens</th>
            <th>When</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each store.recent as review (review.id)}
            <tr>
              <td><StatusBadge status={review.reviewStatus} /></td>
              <td class="mono">{review.workspaceSlug}/{review.repositorySlug}</td>
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
              <td title="input + output">
                {tokens((review.inputTokens ?? 0) + (review.outputTokens ?? 0))}
              </td>
              <td class="dim" title={review.createdAt}>
                {relativeTime(review.createdAt)}
              </td>
              <td>
                <button class="link" onclick={() => store.openReview(review.id)}>
                  Open
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

  .repos {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
    gap: 12px;
  }

  .repo {
    padding: 14px 16px;
    display: grid;
    gap: 11px;
  }

  .repo > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .bar {
    display: flex;
    height: 5px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--surface-2);
  }

  .seg {
    min-width: 0;
  }

  .seg.ok {
    background: var(--ok);
  }

  .seg.bad {
    background: var(--bad);
  }

  .seg.mute {
    background: var(--mute);
  }

  dl {
    margin: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 14px;
  }

  dl div {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 12.5px;
  }

  dt {
    color: var(--text-dim);
  }

  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }

  .repo footer {
    font-size: 12px;
    border-top: 1px solid var(--border);
    padding-top: 9px;
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
