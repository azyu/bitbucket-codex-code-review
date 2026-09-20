<script lang="ts">
  import LocaleToggle from "./components/LocaleToggle.svelte";
  import LockScreen from "./components/LockScreen.svelte";
  import Overview from "./components/Overview.svelte";
  import ReviewDetail from "./components/ReviewDetail.svelte";
  import Settings from "./components/Settings.svelte";
  import { t } from "./lib/i18n.svelte";
  import { store } from "./lib/store.svelte";
  import { applyStoredTheme, setTheme, type Theme } from "./lib/theme";

  let theme = $state<Theme>(applyStoredTheme());

  function toggleTheme(): void {
    theme = theme === "dark" ? "light" : "dark";
    setTheme(theme);
  }
</script>

{#if store.locked}
  <LockScreen />
{:else}
  <header>
    <div class="brand">
      <strong>{t("app.title")}</strong>
      <nav>
        <button
          class:on={store.view === "overview"}
          onclick={() => (store.view = "overview")}>{t("nav.overview")}</button
        >
        <button
          class:on={store.view === "settings"}
          onclick={() => (store.view = "settings")}>{t("nav.settings")}</button
        >
      </nav>
    </div>
    <div class="tools">
      <button onclick={() => store.refreshView()} disabled={store.loading}>
        {store.loading ? t("action.refreshing") : t("action.refresh")}
      </button>
      <LocaleToggle />
      <button onclick={toggleTheme} aria-label={t("theme.toggle")}>
        {theme === "dark" ? t("theme.light") : t("theme.dark")}
      </button>
      <button onclick={() => store.lock()}>{t("action.lock")}</button>
    </div>
  </header>

  <main>
    {#if store.loadError !== null}
      <p class="banner" role="alert">{store.loadError}</p>
    {/if}

    {#if store.view === "overview"}
      <Overview />
    {:else}
      <Settings />
    {/if}
  </main>

  {#if store.detail !== null || store.detailError !== null || store.detailLoading}
    <ReviewDetail />
  {/if}
{/if}

<style>
  header {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
  }

  strong {
    font-size: 14.5px;
    letter-spacing: -0.01em;
  }

  nav {
    display: flex;
    gap: 4px;
  }

  nav button {
    border-color: transparent;
    background: transparent;
    color: var(--text-dim);
    padding: 5px 11px;
  }

  nav button.on {
    background: var(--surface-2);
    border-color: var(--border);
    color: var(--text);
    font-weight: 600;
  }

  .tools {
    display: flex;
    gap: 8px;
  }

  main {
    max-width: 1280px;
    margin: 0 auto;
    padding: 20px;
    display: grid;
    gap: 20px;
  }

  .banner {
    margin: 0;
    padding: 10px 12px;
    border-radius: 6px;
    color: var(--bad);
    background: var(--bad-bg);
  }
</style>
