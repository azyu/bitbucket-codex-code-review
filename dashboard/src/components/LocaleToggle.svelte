<script lang="ts">
  import { getLocale, setLocale, t, type Locale } from "../lib/i18n.svelte";

  let locale = $derived<Locale>(getLocale());
</script>

<!-- Also rendered on the lock screen: the locale defaults to Korean rather
     than to a system preference, so an English reader who cannot switch before
     unlocking has no way to read the screen that asks for the key. -->
<button onclick={() => setLocale(locale === "ko" ? "en" : "ko")} aria-label={t("locale.toggle")}>
  {locale === "ko" ? t("locale.en") : t("locale.ko")}
</button>
