<script lang="ts">
  import {
    GLOBAL_SECRET_KEYS,
    GLOBAL_VALUE_KEYS,
    REPOSITORY_SECRET_KEYS,
    REPOSITORY_VALUE_KEYS,
  } from "../lib/fields";
  import { absoluteTime } from "../lib/format";
  import { resolve, t } from "../lib/i18n.svelte";
  import { store } from "../lib/store.svelte";
  import SecretField from "./SecretField.svelte";
  import ValueField from "./ValueField.svelte";
  import { fieldLabel, primaryButton, TONE_CLASS } from "../lib/ui";

  const pane = "grid content-start gap-3.5 rounded-lg border border-border bg-surface px-5 py-4.5";
  const paneHeader = "flex flex-wrap items-start justify-between gap-3.5";
  const subheading =
    "border-t border-border pt-3.5 text-[11.5px] tracking-[0.06em] text-fg-dim uppercase";
  const note = "text-xs text-fg-dim";
  const grid = "grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-4 gap-y-3.25";
  const field = "grid content-start gap-1.25";
  const notice = "rounded-md px-3 py-2.25 text-code";
  const NOTICE_CLASS = {
    ok: TONE_CLASS.ok,
    conflict: TONE_CLASS.warn,
    error: TONE_CLASS.bad,
  } as const;

  let globalScope = $derived(store.settings?.global);
  let repositories = $derived(store.settings?.repositories ?? []);
  let saving = $state(false);

  async function save(run: () => Promise<void>): Promise<void> {
    saving = true;
    try {
      await run();
    } finally {
      saving = false;
    }
  }
</script>

{#if globalScope === undefined}
  <p class="rounded-lg border border-border bg-surface p-5.5 text-center text-fg-dim">{t("settings.notLoaded")}</p>
{:else}
  <section class={pane}>
    <header class={paneHeader}>
      <div class="grid max-w-[60ch] gap-0.75">
        <h2 class="text-[15px]">{t("settings.global")}</h2>
        <span class={note}>
          {t("settings.meta", {
            revision: globalScope.revision,
            updatedAt: absoluteTime(globalScope.updatedAt),
          })}
        </span>
      </div>
      <button
        class={primaryButton}
        disabled={saving}
        onclick={() => save(() => store.saveGlobal())}
      >
        {saving ? t("common.saving") : t("settings.saveGlobal")}
      </button>
    </header>

    {#if store.globalNotice !== null}
      <p class={[notice, NOTICE_CLASS[store.globalNotice.kind]]} role="status">
        {resolve(store.globalNotice.text)}
      </p>
    {/if}

    <div class={grid}>
      {#each GLOBAL_VALUE_KEYS as key (key)}
        <ValueField name={key} bind:value={store.globalDraft.values[key]} />
      {/each}
    </div>

    <h3 class={subheading}>{t("settings.secrets")}</h3>
    <p class={note}>{t("settings.secretsNote")}</p>
    <div class={grid}>
      {#each GLOBAL_SECRET_KEYS as key (key)}
        <SecretField
          name={key}
          status={globalScope.secrets[key]}
          bind:draft={store.globalDraft.secrets[key]}
        />
      {/each}
    </div>

    <h3 class={subheading}>{t("settings.basicCredential")}</h3>
    <p class={note}>
      {t("settings.basicNote")}
      {globalScope.basicCredentialConfigured
        ? t("settings.basicConfigured")
        : t("settings.basicNotConfigured")}
    </p>
    <div class={grid}>
      <div class={field}>
        <label for="basic-operation" class={fieldLabel}>{t("settings.action")}</label>
        <select id="basic-operation" bind:value={store.globalDraft.basicOperation}>
          <option value="keep">{t("op.keep")}</option>
          <option value="replace">{t("op.replace")}</option>
          <option value="clear">{t("op.clear")}</option>
        </select>
      </div>
      <div class={field}>
        <label for="basic-username" class={fieldLabel}>{t("settings.username")}</label>
        <input
          id="basic-username"
          autocomplete="off"
          disabled={store.globalDraft.basicOperation !== "replace"}
          bind:value={store.globalDraft.basicUsername}
        />
      </div>
      <div class={field}>
        <label for="basic-password" class={fieldLabel}>{t("settings.appPassword")}</label>
        <input
          id="basic-password"
          type="password"
          autocomplete="off"
          disabled={store.globalDraft.basicOperation !== "replace"}
          bind:value={store.globalDraft.basicAppPassword}
        />
      </div>
    </div>
  </section>

  <section class={pane}>
    <header class={paneHeader}>
      <div class="grid max-w-[60ch] gap-0.75">
        <h2 class="text-[15px]">{t("settings.repoOverride")}</h2>
        <span class={note}>{t("settings.repoOverrideNote")}</span>
      </div>
      <button
        class={primaryButton}
        disabled={saving ||
          store.repositoryDraftStale ||
          store.repositoryDraft.repositorySlug === ""}
        onclick={() => save(() => store.saveRepository())}
      >
        {saving ? t("common.saving") : t("settings.saveRepository")}
      </button>
    </header>

    {#if store.repositoryNotice !== null}
      <p class={[notice, NOTICE_CLASS[store.repositoryNotice.kind]]} role="status">
        {resolve(store.repositoryNotice.text)}
      </p>
    {/if}

    <div class="grid grid-cols-[1fr_1fr_auto] items-end gap-2.5">
      <div class={field}>
        <label for="repo-workspace" class={fieldLabel}>{t("settings.workspaceSlug")}</label>
        <input
          id="repo-workspace"
          autocomplete="off"
          bind:value={store.repositoryDraft.workspaceSlug}
        />
      </div>
      <div class={field}>
        <label for="repo-slug" class={fieldLabel}>{t("settings.repositorySlug")}</label>
        <input
          id="repo-slug"
          autocomplete="off"
          bind:value={store.repositoryDraft.repositorySlug}
        />
      </div>
      <button
        disabled={store.repositoryDraft.repositorySlug === "" ||
          store.repositoryDraft.workspaceSlug === ""}
        onclick={() =>
          store.loadRepository(
            store.repositoryDraft.workspaceSlug,
            store.repositoryDraft.repositorySlug,
          )}
      >
        {t("action.load")}
      </button>
    </div>

    {#if repositories.length > 0}
      <div class="flex flex-wrap items-center gap-1.5 text-xs">
        <span class="text-fg-dim">{t("settings.configured")}</span>
        {#each repositories as scope (scope.workspaceSlug + "/" + scope.repositorySlug)}
          <button
            class="rounded-full bg-surface-2 px-2.25 py-0.5 font-mono text-code"
            onclick={() =>
              store.loadRepository(scope.workspaceSlug, scope.repositorySlug)}
          >
            {scope.workspaceSlug}/{scope.repositorySlug}
          </button>
        {/each}
      </div>
    {/if}

    {#if store.repositoryLoadedIdentity === null}
      <p class={note}>{t("settings.loadHint")}</p>
    {:else if store.repositoryDraftStale}
      <p class={[notice, NOTICE_CLASS.conflict]} role="alert">
        {t("settings.staleIdentity", {
          current: `${store.repositoryDraft.workspaceSlug}/${store.repositoryDraft.repositorySlug}`,
          loaded: `${store.repositoryLoadedIdentity.workspaceSlug}/${store.repositoryLoadedIdentity.repositorySlug}`,
        })}
      </p>
    {:else}
      <div class={grid}>
        {#each REPOSITORY_VALUE_KEYS as key (key)}
          <ValueField
            name={key}
            bind:value={store.repositoryDraft.values[key].value}
            bind:inherit={store.repositoryDraft.values[key].inherit}
          />
        {/each}
      </div>

      <h3 class={subheading}>{t("settings.secrets")}</h3>
      <div class={grid}>
        {#each REPOSITORY_SECRET_KEYS as key (key)}
          <SecretField
            name={key}
            status={repositories.find(
              (scope) =>
                scope.workspaceSlug ===
                  store.repositoryLoadedIdentity?.workspaceSlug &&
                scope.repositorySlug ===
                  store.repositoryLoadedIdentity?.repositorySlug,
            )?.secrets[key]}
            bind:draft={store.repositoryDraft.secrets[key]}
          />
        {/each}
      </div>
    {/if}
  </section>
{/if}
