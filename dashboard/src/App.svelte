<script lang="ts">
  import LocaleToggle from "./components/LocaleToggle.svelte";
  import LockScreen from "./components/LockScreen.svelte";
  import Overview from "./components/Overview.svelte";
  import ReviewDetail from "./components/ReviewDetail.svelte";
  import Settings from "./components/Settings.svelte";
  import { resolve, t } from "./lib/i18n.svelte";
  import { store } from "./lib/store.svelte";
  import { applyStoredTheme, setTheme, type Theme } from "./lib/theme";

  let theme = $state<Theme>(applyStoredTheme());

  function toggleTheme(): void {
    theme = theme === "dark" ? "light" : "dark";
    setTheme(theme);
  }

  // Whole strings per state: two utilities for one property on the same
  // element resolve by stylesheet order, not by class order.
  const navButton = "px-2.75 py-1.25";
  const navIdle = `${navButton} border-transparent bg-transparent text-fg-dim hover:bg-surface-2`;
  const navActive = `${navButton} border-border bg-surface-2 font-semibold text-fg`;
</script>

{#if store.locked}
  <LockScreen />
{:else}
  <header
    class="sticky top-0 z-5 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3"
  >
    <div class="flex flex-wrap items-center gap-5">
      <strong class="text-[14.5px] tracking-[-0.01em]">{t("app.title")}</strong>
      <nav class="flex gap-1">
        <button
          class={store.view === "overview" ? navActive : navIdle}
          onclick={() => (store.view = "overview")}>{t("nav.overview")}</button
        >
        <button
          class={store.view === "settings" ? navActive : navIdle}
          onclick={() => (store.view = "settings")}>{t("nav.settings")}</button
        >
      </nav>
    </div>
    <div class="flex gap-2">
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

  <main class="mx-auto grid max-w-7xl gap-5 p-5">
    {#if store.loadError !== null}
      <p class="rounded-md bg-bad-bg px-3 py-2.5 text-bad" role="alert">
        {resolve(store.loadError)}
      </p>
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
