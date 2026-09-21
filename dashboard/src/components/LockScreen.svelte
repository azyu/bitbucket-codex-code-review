<script lang="ts">
  import { resolve, t } from "../lib/i18n.svelte";
  import LocaleToggle from "./LocaleToggle.svelte";
  import { store } from "../lib/store.svelte";

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

<main>
  <form class="card" onsubmit={submit}>
    <div class="head">
      <h1>{t("app.title")}</h1>
      <LocaleToggle />
    </div>
    <p class="dim">{t("lock.intro")}</p>

    <label for="dashboard-key">{t("lock.keyLabel")}</label>
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
      <p class="error" role="alert">{resolve(store.authError)}</p>
    {/if}

    <button class="primary" type="submit" disabled={store.unlocking}>
      {store.unlocking ? t("lock.unlocking") : t("lock.unlock")}
    </button>
  </form>
</main>

<style>
  main {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
  }

  form {
    width: 100%;
    max-width: 420px;
    padding: 28px;
    display: grid;
    gap: 14px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  h1 {
    font-size: 19px;
  }

  p {
    margin: 0;
    font-size: 13px;
  }

  label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-dim);
  }

  .error {
    color: var(--bad);
    background: var(--bad-bg);
    padding: 8px 10px;
    border-radius: 6px;
  }
</style>
