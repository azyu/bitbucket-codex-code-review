import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOCALES,
  MESSAGES,
  applyStoredLocale,
  getLocale,
  resolve,
  setLocale,
  t,
} from "./i18n.svelte";

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

  // index.html can only carry one language, so a tab left in the other one is
  // the single label a runtime switch would otherwise miss.
  it("retitles the document on a switch and on boot", () => {
    setLocale("en");
    expect(document.title).toBe("Code review operations");

    setLocale("ko");
    expect(document.title).toBe("코드 리뷰 운영");

    document.title = "stale";
    applyStoredLocale();
    expect(document.title).toBe("코드 리뷰 운영");
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

  // A key present in one locale and not the other falls back to English and
  // renders silently in the wrong language — the failure this whole module
  // exists to prevent, and the one an added label is most likely to cause.
  it("defines the same keys in every locale", () => {
    const [first, ...rest] = LOCALES.map((locale) =>
      Object.keys(MESSAGES[locale]).sort(),
    );

    expect(first?.length).toBeGreaterThan(0);
    for (const keys of rest) expect(keys).toEqual(first);
  });

  // A gap has to be visible in the UI, not rendered as an empty label.
  it("falls back to English, then to the key itself", () => {
    expect(t("no.such.key")).toBe("no.such.key");
  });

  // t() resolves against the locale live at call time, so a message kept as
  // its result would stay in the language it was written in while the rest of
  // the screen switches. Storing the key is what makes it follow.
  it("re-resolves a stored message after a switch", () => {
    const stored = { key: "error.keyRequired" };

    expect(resolve(stored)).toBe("대시보드 키를 입력하세요.");
    setLocale("en");
    expect(resolve(stored)).toBe("Enter the dashboard key.");
  });

  it("passes a message it did not author through verbatim", () => {
    // A server message has no key to translate to, so it is shown as received.
    expect(resolve("500 Internal Server Error")).toBe("500 Internal Server Error");
    expect(resolve(null)).toBeNull();
  });

  it("still switches the language when writing storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => setLocale("en")).not.toThrow();
    expect(t("nav.overview")).toBe("Overview");
  });
});
