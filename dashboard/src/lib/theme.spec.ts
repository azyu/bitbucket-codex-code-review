import { afterEach, describe, expect, it, vi } from "vitest";
import { applyStoredTheme, setTheme } from "./theme";

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset["theme"];
  vi.restoreAllMocks();
});

function systemPrefersDark(dark: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: dark })),
  );
}

describe("theme", () => {
  it("follows the system preference when nothing is stored", () => {
    systemPrefersDark(true);
    expect(applyStoredTheme()).toBe("dark");
    expect(document.documentElement.dataset["theme"]).toBe("dark");

    systemPrefersDark(false);
    expect(applyStoredTheme()).toBe("light");
  });

  it("prefers an explicit stored choice over the system preference", () => {
    systemPrefersDark(true);
    setTheme("light");

    expect(applyStoredTheme()).toBe("light");
  });

  it("ignores a stored value that is not a theme", () => {
    systemPrefersDark(true);
    localStorage.setItem("dashboard-theme", "chartreuse");

    expect(applyStoredTheme()).toBe("dark");
  });

  // A private window or blocked site data makes both accessors throw. The page
  // must still render, just without remembering the choice.
  it("falls back to the system preference when reading storage throws", () => {
    systemPrefersDark(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(applyStoredTheme()).toBe("dark");
  });

  it("still applies the theme when writing storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => setTheme("dark")).not.toThrow();
    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });

  it("treats a missing matchMedia as light rather than crashing", () => {
    vi.stubGlobal("matchMedia", undefined);

    expect(applyStoredTheme()).toBe("light");
  });
});
