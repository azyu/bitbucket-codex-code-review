<script lang="ts">
  import { SECRET_LABELS } from "../lib/fields";
  import { t } from "../lib/i18n.svelte";
  import type { SecretDraft } from "../lib/store.svelte";
  import { fieldLabel, TONE_CLASS } from "../lib/ui";

  const tag = "tag rounded-full px-1.75 py-px text-2xs font-semibold whitespace-nowrap";

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

<div class="grid gap-1.25">
  <div class="flex items-baseline justify-between gap-2.5">
    <label for={id} class={fieldLabel}>{label}</label>
    {#if status === undefined}
      <span class={[tag, TONE_CLASS.mute]}>{t("secret.status.unknown")}</span>
    {:else if !status.configured}
      <span class={[tag, TONE_CLASS.mute]}>{t("secret.status.notConfigured")}</span>
    {:else if status.source === "inherited"}
      <span class={[tag, TONE_CLASS.warn]}>{t("secret.status.inherited")}</span>
    {:else if status.source === "global"}
      <span class={[tag, TONE_CLASS.ok]}>{t("secret.status.setGlobally")}</span>
    {:else}
      <!-- Reached only for a secret stored on a repository row:
           runtime-settings.service.ts sets source to the row's own scope, so
           the remaining value is `repository`. Interpolating the source would
           put the raw enum into the Korean label. -->
      <span class={[tag, TONE_CLASS.ok]}>{t("secret.status.setOnRepository")}</span>
    {/if}
  </div>

  <div class="grid grid-cols-[150px_1fr] gap-2">
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
