<script lang="ts">
  import { absoluteTime, count, duration, shortSha, tokens } from "../lib/format";
  import { resolve, t } from "../lib/i18n.svelte";
  import { store } from "../lib/store.svelte";
  import StatusBadge from "./StatusBadge.svelte";

  let detail = $derived(store.detail);

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") store.closeReview();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="scrim" role="presentation" onclick={() => store.closeReview()}></div>

<aside aria-label={t("detail.aria")}>
  <header>
    <div>
      {#if detail !== null}
        <StatusBadge status={detail.reviewStatus} />
        <span class="mono title">
          {detail.workspaceSlug}/{detail.repositorySlug} #{detail.pullRequestId}
        </span>
      {:else}
        <span class="title">{t("detail.title")}</span>
      {/if}
    </div>
    <button onclick={() => store.closeReview()} aria-label={t("action.close")}>
      {t("action.close")}
    </button>
  </header>

  <div class="body">
    {#if store.detailLoading}
      <p class="dim">{t("common.loading")}</p>
    {:else if store.detailError !== null}
      <p class="error" role="alert">{resolve(store.detailError)}</p>
    {:else if detail !== null}
      <dl>
        <div><dt>{t("detail.runId")}</dt><dd class="mono">{detail.id}</dd></div>
        <div>
          <dt>{t("detail.started")}</dt>
          <dd>{absoluteTime(detail.createdAt)}</dd>
        </div>
        <div>
          <dt>{t("detail.updated")}</dt>
          <dd>{absoluteTime(detail.updatedAt)}</dd>
        </div>
        <div><dt>{t("detail.trigger")}</dt><dd>{detail.triggerType}</dd></div>
        <div>
          <dt>{t("detail.branch")}</dt>
          <dd class="mono">{detail.headBranch} → {detail.baseBranch}</dd>
        </div>
        <div>
          <dt>{t("detail.commits")}</dt>
          <dd class="mono">
            {shortSha(detail.headCommitHash)} / {shortSha(detail.baseCommitHash)}
          </dd>
        </div>
        <div>
          <dt>{t("detail.codexModel")}</dt>
          <dd>{detail.codexModel || "—"}</dd>
        </div>
        <div>
          <dt>{t("detail.effort")}</dt>
          <dd>{detail.codexReasoningEffort || "—"}</dd>
        </div>
        <div>
          <dt>{t("detail.codexTime")}</dt>
          <dd>{duration(detail.durationMs)}</dd>
        </div>
        <div>
          <dt>{t("detail.totalTime")}</dt>
          <dd>{duration(detail.totalDurationMs)}</dd>
        </div>
        <div>
          <dt>{t("detail.inputTokens")}</dt>
          <dd>{tokens(detail.inputTokens)}</dd>
        </div>
        <div>
          <dt>{t("detail.cachedInput")}</dt>
          <dd>{tokens(detail.cachedInputTokens)}</dd>
        </div>
        <div>
          <dt>{t("detail.outputTokens")}</dt>
          <dd>{tokens(detail.outputTokens)}</dd>
        </div>
        <div>
          <dt>{t("detail.resultComment")}</dt>
          <dd class="mono">{count(detail.resultCommentId)}</dd>
        </div>
      </dl>

      {#if detail.errorMessage}
        <section>
          <h3>{t("detail.error")}</h3>
          <pre class="error">{detail.errorMessage}</pre>
        </section>
      {/if}

      {#if detail.settingsSnapshot !== null}
        <section>
          <h3>{t("detail.snapshot")}</h3>
          <dl>
            <div>
              <dt>{t("detail.revision")}</dt>
              <dd class="mono">{detail.settingsSnapshot.revision}</dd>
            </div>
            <div>
              <dt>{t("detail.model")}</dt>
              <dd>{detail.settingsSnapshot.model}</dd>
            </div>
            <div>
              <dt>{t("detail.effort")}</dt>
              <dd>{detail.settingsSnapshot.reasoningEffort || "—"}</dd>
            </div>
            <div>
              <dt>{t("detail.timeout")}</dt>
              <dd>{duration(detail.settingsSnapshot.timeoutMs)}</dd>
            </div>
            <div>
              <dt>{t("detail.triggerMode")}</dt>
              <dd>{detail.settingsSnapshot.triggerMode}</dd>
            </div>
            <div>
              <dt>{t("detail.retries")}</dt>
              <dd>{detail.settingsSnapshot.retryAttempts}</dd>
            </div>
          </dl>
        </section>
      {/if}

      {#if detail.reviewOutput}
        <section>
          <h3>{t("detail.published")}</h3>
          <pre>{detail.reviewOutput}</pre>
        </section>
      {/if}
    {/if}
  </div>
</aside>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 40%);
    z-index: 10;
  }

  aside {
    position: fixed;
    inset: 0 0 0 auto;
    width: min(680px, 100%);
    z-index: 11;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border-left: 1px solid var(--border);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 18px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  header > div {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .body {
    padding: 18px;
    overflow-y: auto;
    display: grid;
    gap: 18px;
    align-content: start;
  }

  h3 {
    font-size: 11.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-dim);
    margin-bottom: 8px;
  }

  dl {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 6px 18px;
  }

  dl div {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 12.5px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 5px;
  }

  dt {
    color: var(--text-dim);
  }

  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  pre {
    margin: 0;
    padding: 12px 14px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 60vh;
    overflow-y: auto;
  }

  p {
    margin: 0;
  }

  .error {
    color: var(--bad);
    background: var(--bad-bg);
    border-color: var(--bad-bg);
    padding: 10px 12px;
    border-radius: 6px;
  }
</style>
