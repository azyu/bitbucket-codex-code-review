<script lang="ts">
  import { count, duration, percent, relativeTime, shortSha, tokens } from "../lib/format";
  import { t, tEnum } from "../lib/i18n.svelte";
  import { store } from "../lib/store.svelte";
  import { linkButton } from "../lib/ui";
  import StatusBadge from "./StatusBadge.svelte";

  const LIMITS = [10, 25, 50];

  const card = "rounded-lg border border-border bg-surface";
  const tile = `${card} grid gap-0.5 px-4 py-3.5`;
  const tileLabel = "text-[11.5px] text-fg-dim";
  const tileValue = "text-2xl font-semibold tracking-[-0.02em]";
  const heading = "mb-2.5 text-[13px] tracking-[0.06em] text-fg-dim uppercase";
  // The workspace slug lives beside the heading instead of on every row, so
  // it must opt out of the heading's uppercase tracking.
  const workspace = "ml-2 font-mono text-code font-normal tracking-normal normal-case";
  const empty = `${card} p-5.5 text-center text-fg-dim`;
  const scroll = `${card} overflow-x-auto`;
  const limitButton = "px-2.5 py-0.75 text-xs";
  const limitIdle = `${limitButton} text-fg-dim`;
  const limitActive = `${limitButton} bg-surface-2 font-semibold text-fg`;

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

<section class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
  <div class={tile}>
    <span class={tileLabel}>{t("overview.runs")}</span>
    <strong class={tileValue}>{count(totals.total)}</strong>
    <span class={tileLabel}>
      {t("overview.repositories", { count: store.repoStats.length })}
    </span>
  </div>
  <div class={tile}>
    <span class={tileLabel}>{t("overview.completed")}</span>
    <strong class={[tileValue, "text-ok"]}>{count(totals.completed)}</strong>
    <span class={tileLabel}>
      {t("overview.ofRuns", {
        percent: percent(totals.completed, totals.total),
      })}
    </span>
  </div>
  <div class={tile}>
    <span class={tileLabel}>{t("overview.failed")}</span>
    <strong class={[tileValue, totals.failed > 0 && "text-bad"]}>{count(totals.failed)}</strong>
    <span class={tileLabel}>
      {t("overview.superseded", { count: count(totals.superseded) })}
    </span>
  </div>
  <div class={tile}>
    <span class={tileLabel}>{t("overview.reviewTime")}</span>
    <strong class={tileValue}>{duration(totals.reviewTotalMs)}</strong>
    <span class={tileLabel}>
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
  <div class={tile}>
    <span class={tileLabel}>{t("overview.tokens")}</span>
    <strong class={tileValue}>{tokens(totals.totalTokens)}</strong>
    <span class={tileLabel}>{t("overview.inputOutput")}</span>
  </div>
</section>

<section>
  <h2 class={heading}>
    {t("overview.reposHeading")}
    {#if sharedWorkspace !== null}<span class={workspace}>{sharedWorkspace}</span
      >{/if}
  </h2>
  {#if ranked.length === 0}
    <p class={empty}>{t("overview.noRuns")}</p>
  {:else}
    <div class={scroll}>
      <table class="whitespace-nowrap tabular-nums">
        <thead>
          <tr>
            <th>{t("column.repository")}</th>
            <th>{t("column.status")}</th>
            <th class="text-right">{t("overview.runCount")}</th>
            <th class="text-right">{t("overview.success")}</th>
            <th class="text-right">{t("overview.codexAvg")}</th>
            <th class="text-right">{t("overview.reviewAvg")}</th>
            <th class="text-right">{t("column.tokens")}</th>
            <th>{t("overview.latestPr")}</th>
          </tr>
        </thead>
        <tbody>
          {#each ranked as repo (repo.workspaceSlug + "/" + repo.repoSlug)}
            <tr>
              <td class="font-mono text-code">
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
                  <span class="text-fg-dim">—</span>
                {/if}
              </td>
              <td class="text-right">{count(repo.counts.total)}</td>
              <!-- The failed and superseded counts have no column of their own.
                   A title would carry them only to a mouse — a td takes no
                   focus and a touch screen has no hover — so they ride along
                   as text the cell's accessible name includes. -->
              <td class="text-right">
                {percent(repo.counts.completed, repo.counts.total)}
                <span class="sr-only">
                  {t("overview.breakdown", {
                    completed: repo.counts.completed,
                    failed: repo.counts.failed,
                    superseded: repo.counts.superseded,
                  })}
                </span>
              </td>
              <td class="text-right">{duration(repo.durations.codexAvgMs)}</td>
              <td class="text-right">{duration(repo.durations.reviewAvgMs)}</td>
              <td class="text-right">{tokens(repo.tokens.totalTokens)}</td>
              <td>
                {#if repo.latestReview !== null}
                  <button
                    class={linkButton}
                    onclick={() => store.openReview(repo.latestReview!.id)}
                  >
                    #{repo.latestReview.pullRequestId}
                  </button>
                  <span class="text-fg-dim">
                    · {relativeTime(repo.latestReview.createdAt)}
                  </span>
                {:else}
                  <span class="text-fg-dim">—</span>
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
  <div class="flex items-baseline justify-between gap-3">
    <h2 class={heading}>
      {t("overview.recent")}
      {#if sharedWorkspace !== null}<span class={workspace}>{sharedWorkspace}</span
        >{/if}
    </h2>
    <div class="mb-2.5 flex gap-1">
      {#each LIMITS as limit (limit)}
        <button
          class={store.recentLimit === limit ? limitActive : limitIdle}
          disabled={store.loading}
          onclick={() => store.setRecentLimit(limit)}>{limit}</button
        >
      {/each}
    </div>
  </div>

  {#if store.recent.length === 0}
    <p class={empty}>{t("overview.nothingYet")}</p>
  {:else}
    <div class={scroll}>
      <table class="whitespace-nowrap tabular-nums">
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
              <td class="font-mono text-code">
                {repoLabel(review.workspaceSlug, review.repositorySlug)}
              </td>
              <td>#{review.pullRequestId}</td>
              <td class="font-mono text-code text-fg-dim">{shortSha(review.headCommitHash)}</td>
              <td class="text-fg-dim">{tEnum("trigger", review.triggerType)}</td>
              <td class="text-fg-dim">
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
              <td class="text-fg-dim" title={review.createdAt}>
                {relativeTime(review.createdAt)}
              </td>
              <td>
                <button class={linkButton} onclick={() => store.openReview(review.id)}>
                  {t("action.open")}
                </button>
              </td>
            </tr>
            {#if review.errorMessage}
              <tr>
                <td class="border-b-0 pt-0"></td>
                <td
                  colspan="10"
                  class="border-b-0 pt-0 font-mono text-xs whitespace-normal text-bad"
                >{review.errorMessage}</td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
