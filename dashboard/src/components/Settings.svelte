<script lang="ts">
  import {
    GLOBAL_SECRET_KEYS,
    GLOBAL_VALUE_KEYS,
    REPOSITORY_SECRET_KEYS,
    REPOSITORY_VALUE_KEYS,
  } from "../lib/fields";
  import { absoluteTime } from "../lib/format";
  import { store } from "../lib/store.svelte";
  import SecretField from "./SecretField.svelte";
  import ValueField from "./ValueField.svelte";

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
  <p class="card empty dim">Settings are not loaded.</p>
{:else}
  <section class="card pane">
    <header>
      <div>
        <h2>Global</h2>
        <span class="dim">
          revision {globalScope.revision} · updated {absoluteTime(
            globalScope.updatedAt,
          )}
        </span>
      </div>
      <button
        class="primary"
        disabled={saving}
        onclick={() => save(() => store.saveGlobal())}
      >
        {saving ? "Saving…" : "Save global"}
      </button>
    </header>

    {#if store.globalNotice !== null}
      <p class="notice" data-kind={store.globalNotice.kind} role="status">
        {store.globalNotice.text}
      </p>
    {/if}

    <div class="grid">
      {#each GLOBAL_VALUE_KEYS as key (key)}
        <ValueField name={key} bind:value={store.globalDraft.values[key]} />
      {/each}
    </div>

    <h3>Secrets</h3>
    <p class="dim note">
      Stored encrypted; the API reports only whether a value is configured and
      where it came from. Values are write-only.
    </p>
    <div class="grid">
      {#each GLOBAL_SECRET_KEYS as key (key)}
        <SecretField
          name={key}
          status={globalScope.secrets[key]}
          bind:draft={store.globalDraft.secrets[key]}
        />
      {/each}
    </div>

    <h3>Bitbucket basic credential</h3>
    <p class="dim note">
      Global only — the repository route rejects it.
      {globalScope.basicCredentialConfigured
        ? "Currently configured."
        : "Not configured."}
    </p>
    <div class="grid">
      <div class="field">
        <label for="basic-operation">Action</label>
        <select id="basic-operation" bind:value={store.globalDraft.basicOperation}>
          <option value="keep">leave unchanged</option>
          <option value="replace">replace</option>
          <option value="clear">clear</option>
        </select>
      </div>
      <div class="field">
        <label for="basic-username">Username</label>
        <input
          id="basic-username"
          autocomplete="off"
          disabled={store.globalDraft.basicOperation !== "replace"}
          bind:value={store.globalDraft.basicUsername}
        />
      </div>
      <div class="field">
        <label for="basic-password">App password</label>
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

  <section class="card pane">
    <header>
      <div>
        <h2>Repository override</h2>
        <span class="dim">
          Unchecked fields are stored on the repository; inherited fields fall
          back to global.
        </span>
      </div>
      <button
        class="primary"
        disabled={saving ||
          store.repositoryDraftStale ||
          store.repositoryDraft.repositorySlug === ""}
        onclick={() => save(() => store.saveRepository())}
      >
        {saving ? "Saving…" : "Save repository"}
      </button>
    </header>

    {#if store.repositoryNotice !== null}
      <p class="notice" data-kind={store.repositoryNotice.kind} role="status">
        {store.repositoryNotice.text}
      </p>
    {/if}

    <div class="identity">
      <div class="field">
        <label for="repo-workspace">Workspace slug</label>
        <input
          id="repo-workspace"
          autocomplete="off"
          bind:value={store.repositoryDraft.workspaceSlug}
        />
      </div>
      <div class="field">
        <label for="repo-slug">Repository slug</label>
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
        Load
      </button>
    </div>

    {#if repositories.length > 0}
      <div class="known">
        <span class="dim">Configured:</span>
        {#each repositories as scope (scope.workspaceSlug + "/" + scope.repositorySlug)}
          <button
            class="chip mono"
            onclick={() =>
              store.loadRepository(scope.workspaceSlug, scope.repositorySlug)}
          >
            {scope.workspaceSlug}/{scope.repositorySlug}
          </button>
        {/each}
      </div>
    {/if}

    {#if store.repositoryLoadedIdentity === null}
      <p class="hint dim">Load a repository to edit its override.</p>
    {:else if store.repositoryDraftStale}
      <p class="notice" data-kind="conflict" role="alert">
        The identity fields changed since load. Load
        <code
          >{store.repositoryDraft.workspaceSlug}/{store.repositoryDraft
            .repositorySlug}</code
        >
        again before saving — this draft belongs to
        <code
          >{store.repositoryLoadedIdentity.workspaceSlug}/{store
            .repositoryLoadedIdentity.repositorySlug}</code
        >.
      </p>
    {:else}
      <div class="grid">
        {#each REPOSITORY_VALUE_KEYS as key (key)}
          <ValueField
            name={key}
            bind:value={store.repositoryDraft.values[key].value}
            bind:inherit={store.repositoryDraft.values[key].inherit}
          />
        {/each}
      </div>

      <h3>Secrets</h3>
      <div class="grid">
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

<style>
  .pane {
    padding: 18px 20px;
    display: grid;
    gap: 14px;
    align-content: start;
  }

  .pane > header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }

  .pane > header > div {
    display: grid;
    gap: 3px;
    max-width: 60ch;
  }

  h2 {
    font-size: 15px;
  }

  h3 {
    font-size: 11.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-dim);
    border-top: 1px solid var(--border);
    padding-top: 14px;
  }

  span.dim {
    font-size: 12px;
  }

  .note,
  .hint {
    margin: 0;
    font-size: 12px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 13px 16px;
  }

  .field {
    display: grid;
    gap: 5px;
    align-content: start;
  }

  label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-dim);
  }

  .identity {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 10px;
    align-items: end;
  }

  .known {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .chip {
    padding: 2px 9px;
    border-radius: 999px;
    background: var(--surface-2);
  }

  .notice {
    margin: 0;
    padding: 9px 12px;
    border-radius: 6px;
    font-size: 12.5px;
  }

  .notice[data-kind="ok"] {
    color: var(--ok);
    background: var(--ok-bg);
  }

  .notice[data-kind="conflict"] {
    color: var(--warn);
    background: var(--warn-bg);
  }

  .notice[data-kind="error"] {
    color: var(--bad);
    background: var(--bad-bg);
  }

  .empty {
    padding: 22px;
    text-align: center;
    margin: 0;
  }
</style>
