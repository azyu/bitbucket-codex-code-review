<script lang="ts">
  import { resolve, t } from "../lib/i18n.svelte";
  import LocaleToggle from "./LocaleToggle.svelte";
  import { store } from "../lib/store.svelte";
  import { fieldLabel, primaryButton } from "../lib/ui";

  let key = $state("");

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const entered = key;
    // Dropped from the component before the request resolves, so the key lives
    // only in the store's private field while a request is in flight.
    key = "";
    await store.unlock(entered);
  }
</script>

<main class="grid min-h-screen place-items-center p-6">
  <form
    class="grid w-full max-w-105 gap-3.5 rounded-lg border border-border bg-surface p-7"
    onsubmit={submit}
  >
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-[19px]">{t("app.title")}</h1>
      <LocaleToggle />
    </div>
    <p class="text-[13px] text-fg-dim">{t("lock.intro")}</p>

    <label for="dashboard-key" class={fieldLabel}>
      {t("lock.keyLabel")}
    </label>
    <input
      id="dashboard-key"
      type="password"
      autocomplete="off"
      spellcheck="false"
      bind:value={key}
      disabled={store.unlocking}
      placeholder="DASHBOARD_SECRET_KEY"
    />

    {#if store.authError !== null}
      <p class="rounded-md bg-bad-bg px-2.5 py-2 text-[13px] text-bad" role="alert">
        {resolve(store.authError)}
      </p>
    {/if}

    <button class={primaryButton} type="submit" disabled={store.unlocking}>
      {store.unlocking ? t("lock.unlocking") : t("lock.unlock")}
    </button>
  </form>
</main>
