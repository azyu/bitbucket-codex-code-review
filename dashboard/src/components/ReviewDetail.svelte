<script lang="ts">
  import { absoluteTime, count, duration, shortSha, tokens } from "../lib/format";
  import { resolve, t, tEnum } from "../lib/i18n.svelte";
  import { store } from "../lib/store.svelte";
  import StatusBadge from "./StatusBadge.svelte";

  const headingText = "text-[11.5px] tracking-[0.06em] text-fg-dim uppercase";
  const heading = `mb-2 ${headingText}`;
  const grid = "grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-x-4.5 gap-y-1.5";
  const row = "flex justify-between gap-2.5 border-b border-border pb-1.25 text-code";
  // Both variants spell out their own box so no two utilities for the same
  // property meet on one element — which one wins would be stylesheet order.
  const pre =
    "max-h-[60vh] overflow-y-auto border font-mono text-xs leading-[1.6] break-words whitespace-pre-wrap";
  const preNormal = `${pre} rounded-lg border-border bg-surface px-3.5 py-3`;
  const preError = `${pre} rounded-md border-bad-bg bg-bad-bg px-3 py-2.5 text-bad`;

  let detail = $derived(store.detail);
  // Derived from the store alone: it drops the prompt whenever the open run
  // changes, so a new run always starts collapsed.
  let promptOpen = $derived(
    store.prompt !== null || store.promptError !== null || store.promptLoading,
  );

  function togglePrompt(id: number): void {
    if (promptOpen) store.hidePrompt();
    else void store.loadPrompt(id);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") store.closeReview();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="fixed inset-0 z-10 bg-black/40" role="presentation" onclick={() => store.closeReview()}></div>

<aside
  aria-label={t("detail.aria")}
  class="fixed inset-y-0 right-0 z-11 flex w-[min(680px,100%)] flex-col border-l border-border bg-bg"
>
  <header
    class="flex items-center justify-between gap-3 border-b border-border bg-surface px-4.5 py-3.25"
  >
    <div class="flex min-w-0 items-center gap-2.25">
      {#if detail !== null}
        <StatusBadge status={detail.reviewStatus} />
        <span class="truncate font-mono text-code font-semibold">
          {detail.workspaceSlug}/{detail.repositorySlug} #{detail.pullRequestId}
        </span>
      {:else}
        <span class="truncate font-semibold">{t("detail.title")}</span>
      {/if}
    </div>
    <button onclick={() => store.closeReview()} aria-label={t("action.close")}>
      {t("action.close")}
    </button>
  </header>

  <div class="grid content-start gap-4.5 overflow-y-auto p-4.5">
    {#if store.detailLoading}
      <p class="text-fg-dim">{t("common.loading")}</p>
    {:else if store.detailError !== null}
      <p class="rounded-md bg-bad-bg px-3 py-2.5 text-bad" role="alert">{resolve(store.detailError)}</p>
    {:else if detail !== null}
      <dl class={grid}>
        <div class={row}><dt class="text-fg-dim">{t("detail.runId")}</dt><dd class="text-right font-mono tabular-nums">{detail.id}</dd></div>
        <div class={row}>
          <dt class="text-fg-dim">{t("detail.started")}</dt>
          <dd class="text-right tabular-nums">{absoluteTime(detail.createdAt)}</dd>
        </div>
        <div class={row}>
          <dt class="text-fg-dim">{t("detail.updated")}</dt>
          <dd class="text-right tabular-nums">{absoluteTime(detail.updatedAt)}</dd>
        </div>
        <div class={row}>
          <dt class="text-fg-dim">{t("detail.trigger")}</dt>
          <dd class="text-right tabular-nums">{tEnum("trigger", detail.triggerType)}</dd>
        </div>
        <div class={row}>
          <dt class="text-fg-dim">{t("detail.branch")}</dt>
          <dd class="text-right font-mono tabular-nums">{detail.headBranch} → {detail.baseBranch}</dd>
        </div>
        <div class={row}>
          <dt class="text-fg-dim">{t("detail.commits")}</dt>
          <dd class="text-right font-mono tabular-nums">
            {shortSha(detail.headCommitHash)} / {shortSha(detail.baseCommitHash)}
          </dd>
        </div>
        <div class={row}>
          <dt class="text-fg-dim">{t("detail.codexModel")}</dt>
          <dd class="text-right tabular-nums">{detail.codexModel || "—"}</dd>
        </div>
        <div class={row}>
          <dt class="text-fg-dim">{t("detail.effort")}</dt>
          <dd class="text-right tabular-nums">{detail.codexReasoningEffort || "—"}</dd>
        </div>
        <div class={row}>
          <dt class="text-fg-dim">{t("detail.cliVersion")}</dt>
          <dd class="text-right font-mono tabular-nums">{detail.codexCliVersion || "—"}</dd>
        </div>
        <div class={row}>
          <dt class="text-fg-dim">{t("detail.mergeBase")}</dt>
          <dd class="text-right font-mono tabular-nums">{shortSha(detail.reviewMergeBase)}</dd>
        </div>
        <div class={row}>
          <dt class="text-fg-dim">{t("detail.codexTime")}</dt>
          <dd class="text-right tabular-nums">{duration(detail.durationMs)}</dd>
        </div>
        <div class={row}>
          <dt class="text-fg-dim">{t("detail.totalTime")}</dt>
          <dd class="text-right tabular-nums">{duration(detail.totalDurationMs)}</dd>
        </div>
        <div class={row}>
          <dt class="text-fg-dim">{t("detail.inputTokens")}</dt>
          <dd class="text-right tabular-nums">{tokens(detail.inputTokens)}</dd>
        </div>
        <div class={row}>
          <dt class="text-fg-dim">{t("detail.cachedInput")}</dt>
          <dd class="text-right tabular-nums">{tokens(detail.cachedInputTokens)}</dd>
        </div>
        <div class={row}>
          <dt class="text-fg-dim">{t("detail.outputTokens")}</dt>
          <dd class="text-right tabular-nums">{tokens(detail.outputTokens)}</dd>
        </div>
        <div class={row}>
          <dt class="text-fg-dim">{t("detail.resultComment")}</dt>
          <dd class="text-right font-mono tabular-nums">{count(detail.resultCommentId)}</dd>
        </div>
      </dl>

      {#if detail.errorMessage}
        <section>
          <h3 class={heading}>{t("detail.error")}</h3>
          <pre class={preError}>{detail.errorMessage}</pre>
        </section>
      {/if}

      {#if detail.settingsSnapshot !== null}
        <section>
          <h3 class={heading}>{t("detail.snapshot")}</h3>
          <dl class={grid}>
            <div class={row}>
              <dt class="text-fg-dim">{t("detail.revision")}</dt>
              <dd class="text-right font-mono tabular-nums">{detail.settingsSnapshot.revision}</dd>
            </div>
            <div class={row}>
              <dt class="text-fg-dim">{t("detail.model")}</dt>
              <dd class="text-right tabular-nums">{detail.settingsSnapshot.model}</dd>
            </div>
            <div class={row}>
              <dt class="text-fg-dim">{t("detail.effort")}</dt>
              <dd class="text-right tabular-nums">{detail.settingsSnapshot.reasoningEffort || "—"}</dd>
            </div>
            <div class={row}>
              <dt class="text-fg-dim">{t("detail.timeout")}</dt>
              <dd class="text-right tabular-nums">{duration(detail.settingsSnapshot.timeoutMs)}</dd>
            </div>
            <div class={row}>
              <dt class="text-fg-dim">{t("detail.triggerMode")}</dt>
              <dd class="text-right tabular-nums">{detail.settingsSnapshot.triggerMode}</dd>
            </div>
            <div class={row}>
              <dt class="text-fg-dim">{t("detail.retries")}</dt>
              <dd class="text-right tabular-nums">{detail.settingsSnapshot.retryAttempts}</dd>
            </div>
          </dl>
        </section>
      {/if}

      <section>
        <div class="mb-2 flex items-center justify-between gap-2">
          <h3 class={headingText}>{t("detail.prompt")}</h3>
          <button
            aria-expanded={promptOpen}
            disabled={store.promptLoading}
            onclick={() => togglePrompt(detail.id)}
          >
            {promptOpen ? t("detail.promptHide") : t("detail.promptShow")}
          </button>
        </div>
        {#if promptOpen}
          {#if store.promptLoading}
            <p class="text-fg-dim">{t("common.loading")}</p>
          {:else if store.promptError !== null}
            <p class="rounded-md bg-bad-bg px-3 py-2.5 text-bad" role="alert">{resolve(store.promptError)}</p>
          {:else if store.prompt?.reviewPrompt}
            <pre class={preNormal}>{store.prompt.reviewPrompt}</pre>
          {:else if store.prompt !== null}
            <p class="text-fg-dim">{t("detail.promptMissing")}</p>
          {/if}
        {/if}
      </section>

      {#if detail.reviewOutput}
        <section>
          <h3 class={heading}>{t("detail.published")}</h3>
          <pre class={preNormal}>{detail.reviewOutput}</pre>
        </section>
      {/if}
    {/if}
  </div>
</aside>
