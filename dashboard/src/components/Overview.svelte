<script lang="ts">
  import { count, duration, percent, relativeTime, shortSha, tokens } from "../lib/format";
  import { t, tEnum } from "../lib/i18n.svelte";
  import { store } from "../lib/store.svelte";
  import { LONG_RUNNING_MS, needsAttention } from "../lib/attention";
  import { nextSort, sortRepos, type RepoSort, type RepoSortKey } from "../lib/sort";
  import { linkButton, TONE_CLASS } from "../lib/ui";
  import StatusBadge from "./StatusBadge.svelte";

  const LIMITS = [10, 25, 50];

  const card = "rounded-lg border border-border bg-surface";
  // Inset lines on the right and bottom; the grid's -1px margins tuck the last
  // column's and row's lines under the card border, and a short last row
  // leaves plain surface instead of a filled gap.
  const tile = "grid content-start gap-0.5 px-4 py-3.5 shadow-[inset_-1px_-1px_0_var(--color-border)]";
  const tileLabel = "text-[11.5px] text-fg-dim";
  const tileValue = "text-2xl font-semibold tracking-[-0.02em]";
  const heading = "mb-2.5 text-[13px] font-semibold text-fg-dim";
  // The workspace slug lives beside the heading instead of on every row, so
  // it must opt out of the heading's uppercase tracking.
  const workspace = "ml-2 font-mono text-code font-normal tracking-normal normal-case";
  const empty = `${card} p-5.5 text-center text-fg-dim`;
  // relative: the sr-only text in a cell is absolutely positioned, and without
  // a positioned ancestor inside the scroller it lands at the table's far edge
  // in page coordinates — widening the whole page on a phone.
  const scroll = `${card} relative overflow-x-auto`;
  const limitButton = "px-2.5 py-0.75 text-xs";
  const limitIdle = `${limitButton} text-fg-dim`;
  const limitActive = `${limitButton} bg-surface-2 font-semibold text-fg`;
  // The th already carries the header look; the button only drops its chrome.
  const sortButton =
    "inline-flex items-center gap-1 border-none bg-transparent p-0 font-medium text-inherit hover:bg-transparent hover:text-fg";

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

  let attention = $derived(needsAttention(store.repoStats));
  let urgent = $derived(attention.filter((item) => item.kind !== "inFlight"));
  let running = $derived(attention.filter((item) => item.kind === "inFlight"));
  let inFlight = $derived(
    totals.total - totals.completed - totals.failed - totals.superseded,
  );

  // Error text is collapsed to two lines per row until asked for.
  let expanded = $state<Record<number, boolean>>({});

  /** Width of one segment of a stacked bar, as a share of `whole`. */
  function share(part: number, whole: number): string {
    return `${whole > 0 ? (part / whole) * 100 : 0}%`;
  }

  let repoSort = $state<RepoSort>({ key: "runs", dir: "desc" });
  let ranked = $derived(sortRepos(store.repoStats, repoSort));
</script>

{#snippet bar(completed: number, failed: number, superseded: number, total: number)}
  <span class="flex h-1.5 gap-px overflow-hidden rounded-xs bg-surface-2" aria-hidden="true">
    <i class="bg-ok" style:width={share(completed, total)}></i>
    <i class="bg-bad" style:width={share(failed, total)}></i>
    <i class="bg-fg-dim opacity-45" style:width={share(superseded, total)}></i>
  </span>
{/snippet}

{#snippet arrow(key: RepoSortKey)}
  <span aria-hidden="true" class={repoSort.key === key ? "" : "invisible"}
    >{repoSort.dir === "asc" ? "▲" : "▼"}</span
  >
{/snippet}

{#snippet sortHeader(key: RepoSortKey, label: string, right = false)}
  <th
    class={right ? "text-right" : ""}
    aria-sort={repoSort.key === key
      ? repoSort.dir === "asc"
        ? "ascending"
        : "descending"
      : "none"}
  >
    <!-- The arrow keeps its space while hidden so sorting never reflows the
         columns, and sits on the label's inner side so a right-aligned header
         still ends flush with its numbers. -->
    <button class={sortButton} onclick={() => (repoSort = nextSort(repoSort, key))}>
      {#if right}{@render arrow(key)}{/if}
      {label}
      {#if !right}{@render arrow(key)}{/if}
    </button>
  </th>
{/snippet}

{#if store.repoStats.length > 0}
  <section class={card} aria-labelledby="attention-title">
    <header class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border px-4 py-2.5">
      <h2 id="attention-title" class="text-[14px]">{t("attention.title")}</h2>
      <span class="text-xs text-fg-dim">{t("attention.note")}</span>
    </header>
    {#if attention.length === 0}
      <p class="flex items-center gap-2 px-4 py-3 text-fg-dim">
        <StatusBadge status="completed" />
        {t("attention.clear")}
      </p>
    {:else}
      <ul>
        {#each urgent as { kind, repo } (repo.workspaceSlug + "/" + repo.repoSlug)}
          <li class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2.5 first:border-t-0">
            {#if kind === "longRunning"}
              <span class={["inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONE_CLASS.warn]}>
                {t("attention.longRunning", { minutes: LONG_RUNNING_MS / 60_000 })}
              </span>
            {/if}
            <StatusBadge status={repo.latestReview.reviewStatus} />
            <span class="min-w-0 flex-1 basis-48">
              <span class="font-mono text-code font-semibold">{repoLabel(repo.workspaceSlug, repo.repoSlug)}</span>
              <span class="text-fg-dim">
                #{repo.latestReview.pullRequestId} · {relativeTime(repo.latestReview.createdAt)}
              </span>
            </span>
            <button class="px-2.5 py-1 text-xs" onclick={() => store.openReview(repo.latestReview.id)}>
              {t("action.open")}
            </button>
          </li>
        {/each}
        {#if running.length > 0}
          <li class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2.5 first:border-t-0">
            <span class={["inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONE_CLASS.run]}>
              {t("overview.inFlight", { count: running.length })}
            </span>
            {#each running as { repo } (repo.workspaceSlug + "/" + repo.repoSlug)}
              <span class="whitespace-nowrap">
                <button class={linkButton} onclick={() => store.openReview(repo.latestReview.id)}>
                  {repoLabel(repo.workspaceSlug, repo.repoSlug)} #{repo.latestReview.pullRequestId}
                </button>
                <span class="text-fg-dim">
                  {tEnum("status", repo.latestReview.reviewStatus)} · {relativeTime(repo.latestReview.createdAt)}
                </span>
              </span>
            {/each}
          </li>
        {/if}
      </ul>
    {/if}
  </section>
{/if}

<section class={`${card} overflow-hidden`}>
  <div class="-mr-px -mb-px grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
    <div class={tile}>
      <span class={tileLabel}>{t("overview.runs")}</span>
      <strong class={tileValue}>{count(totals.total)}</strong>
      <span class={tileLabel}>
        {t("overview.repositories", { count: store.repoStats.length })}
        {#if inFlight > 0}
          · <span class="text-run">{t("overview.inFlight", { count: inFlight })}</span>
        {/if}
      </span>
      <span class="mt-1.5">
        {@render bar(totals.completed, totals.failed, totals.superseded, totals.total)}
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
            {@render sortHeader("repository", t("column.repository"))}
            <th>{t("column.status")}</th>
            {@render sortHeader("runs", t("overview.runCount"), true)}
            {@render sortHeader("success", t("overview.success"), true)}
            {@render sortHeader("codexAvg", t("overview.codexAvg"), true)}
            {@render sortHeader("reviewAvg", t("overview.reviewAvg"), true)}
            {@render sortHeader("tokens", t("column.tokens"), true)}
            {@render sortHeader("latest", t("overview.latestPr"))}
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
                <span class="inline-grid grid-cols-[3.25rem_4rem] items-center gap-2">
                  {percent(repo.counts.completed, repo.counts.total)}
                  {@render bar(
                    repo.counts.completed,
                    repo.counts.failed,
                    repo.counts.superseded,
                    repo.counts.total,
                  )}
                </span>
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
            <tr class={review.errorMessage ? "[&>td]:border-b-0" : ""}>
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
                <td class="pt-0"></td>
                <td colspan="10" class="pt-0 whitespace-normal">
                  <div
                    class="grid grid-cols-[1fr_auto] items-start gap-2 rounded-sm border-l-3 border-bad bg-bad-bg py-1.5 pr-2 pl-2.5"
                  >
                    <pre
                      class={expanded[review.id]
                        ? "m-0 font-mono text-xs leading-[1.6] wrap-anywhere whitespace-pre-wrap"
                        : "m-0 line-clamp-2 font-mono text-xs leading-[1.6] wrap-anywhere whitespace-pre-wrap"}
                    >{review.errorMessage}</pre>
                    <button
                      class="border-transparent bg-transparent px-2 py-0.5 text-xs"
                      aria-expanded={expanded[review.id] === true}
                      onclick={() => (expanded[review.id] = !expanded[review.id])}
                    >
                      {expanded[review.id] ? t("action.collapse") : t("action.showAll")}
                    </button>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
