import { afterEach, describe, expect, it, vi } from "vitest";
import { getLocale, setLocale, t } from "./i18n.svelte";

afterEach(() => {
  setLocale("ko");
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("i18n", () => {
  it("defaults to Korean", () => {
    expect(getLocale()).toBe("ko");
    expect(t("nav.overview")).toBe("개요");
  });

  it("switches the rendered language and the document language", () => {
    setLocale("en");

    expect(getLocale()).toBe("en");
    expect(t("nav.overview")).toBe("Overview");
    expect(document.documentElement.lang).toBe("en");
  });

  it("remembers the choice", () => {
    setLocale("en");

    expect(localStorage.getItem("dashboard-locale")).toBe("en");
  });

  it("interpolates named parameters and leaves unknown ones in place", () => {
    setLocale("en");

    expect(t("notice.saved", { revision: 7 })).toBe("Saved at revision 7.");
    expect(t("overview.superseded", {})).toBe("{count} superseded");
  });

  // A gap has to be visible in the UI, not rendered as an empty label.
  it("falls back to English, then to the key itself", () => {
    expect(t("no.such.key")).toBe("no.such.key");
  });

  it("still switches the language when writing storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => setLocale("en")).not.toThrow();
    expect(t("nav.overview")).toBe("Overview");
  });
});
