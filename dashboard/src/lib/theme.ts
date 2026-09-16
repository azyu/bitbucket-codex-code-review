/**
 * Theme preference is the one thing this dashboard persists. It is not derived
 * from the key and carries no operational data, so invariant 1 does not reach
 * it — that invariant is about the key and the documents it unlocks.
 */
const STORAGE_KEY = "dashboard-theme";

export type Theme = "light" | "dark";

function systemTheme(): Theme {
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    // Storage blocked (private window, site data off): fall back to system.
    return null;
  }
}

export function applyStoredTheme(): Theme {
  const theme = stored() ?? systemTheme();
  document.documentElement.dataset["theme"] = theme;
  return theme;
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset["theme"] = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Preference simply does not survive the reload.
  }
}
