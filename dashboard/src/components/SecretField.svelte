<script lang="ts">
  import { SECRET_LABELS } from "../lib/fields";
  import { t } from "../lib/i18n.svelte";
  import type { SecretDraft } from "../lib/store.svelte";

  let {
    name,
    status,
    draft = $bindable(),
  }: {
    name: string;
    /**
     * The API returns `{ configured, source }` and nothing else, so this
     * renders state — never a value, and never a masked stand-in for one.
     * (Spec invariant 5.)
     */
    status: { configured: boolean; source: string } | undefined;
    draft: SecretDraft;
  } = $props();

  let id = $derived(`secret-${name}`);
  let label = $derived(t(SECRET_LABELS[name] ?? name));
</script>

<div class="secret">
  <div class="head">
    <label for={id}>{label}</label>
    {#if status === undefined}
      <span class="tag mute">{t("secret.status.unknown")}</span>
    {:else if !status.configured}
      <span class="tag mute">{t("secret.status.notConfigured")}</span>
    {:else if status.source === "global"}
      <span class="tag warn">{t("secret.status.inherited")}</span>
    {:else}
      <span class="tag ok">
        {t("secret.status.setOn", { source: status.source })}
      </span>
    {/if}
  </div>

  <div class="row">
    <select
      aria-label={t("secret.actionAria", { label })}
      bind:value={draft.operation}
      onchange={() => {
        if (draft.operation !== "replace") draft.value = "";
      }}
    >
      <option value="keep">{t("op.keep")}</option>
      <option value="replace">{t("op.replace")}</option>
      <option value="clear">{t("op.clear")}</option>
    </select>
    <input
      {id}
      type="password"
      autocomplete="off"
      spellcheck="false"
      placeholder={draft.operation === "replace"
        ? t("secret.placeholder.new")
        : t("secret.placeholder.none")}
      disabled={draft.operation !== "replace"}
      bind:value={draft.value}
    />
  </div>
</div>

<style>
  .secret {
    display: grid;
    gap: 5px;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-dim);
  }

  .row {
    display: grid;
    grid-template-columns: 150px 1fr;
    gap: 8px;
  }

  .tag {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 999px;
    white-space: nowrap;
  }

  .tag.ok {
    color: var(--ok);
    background: var(--ok-bg);
  }

  .tag.warn {
    color: var(--warn);
    background: var(--warn-bg);
  }

  .tag.mute {
    color: var(--mute);
    background: var(--mute-bg);
  }
</style>
