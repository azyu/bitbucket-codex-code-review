import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.svelte";
import { setLocale } from "./i18n.svelte";
import { store } from "./store.svelte";

/**
 * Invariant 8: the unauthenticated document is the public shell. Mounting the
 * app with no key must produce a lock screen only — no settings values, no
 * repository names, no review content — and must not talk to the API at all.
 */
describe("invariant 8 — the lock screen is the public shell", () => {
  let target: HTMLElement;
  let fetchMock: ReturnType<typeof vi.fn>;
  let app: Record<string, unknown>;

  beforeEach(() => {
    store.lock();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    target = document.createElement("div");
    document.body.append(target);
    app = mount(App, { target }) as Record<string, unknown>;
  });

  afterEach(() => {
    unmount(app);
    target.remove();
    vi.unstubAllGlobals();
    setLocale("ko");
  });

  it("renders the lock form and nothing else", () => {
    expect(target.querySelector("#dashboard-key")).not.toBeNull();
    expect(target.querySelector("table")).toBeNull();
    expect(target.querySelector("nav")).toBeNull();
    expect(target.querySelector("#basic-username")).toBeNull();
    expect(target.querySelector("#repo-workspace")).toBeNull();
  });

  it("issues no request before a key is entered", () => {
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("holds no settings, repository or review text in the document", () => {
    const text = target.textContent ?? "";

    for (const leak of [
      "revision",
      "gpt-5.6",
      "openaiApiKey",
      "workspace",
      "Save global",
      "completed",
    ]) {
      expect(text.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });

  // The locale defaults to Korean rather than to a system preference, so a
  // toggle reachable only after unlocking would leave an English reader unable
  // to read the screen that asks for the key.
  it("offers the language toggle before unlock", async () => {
    const toggle = target.querySelector<HTMLButtonElement>(
      'button[aria-label="언어 전환"]',
    );
    expect(toggle).not.toBeNull();
    expect(target.querySelector("h1")?.textContent?.trim()).toBe("코드 리뷰 운영");

    toggle?.click();
    await tick();

    expect(target.querySelector("h1")?.textContent?.trim()).toBe(
      "Code review operations",
    );
  });

  it("uses a password input, so the key is never rendered as text", () => {
    const input = target.querySelector<HTMLInputElement>("#dashboard-key");

    expect(input?.type).toBe("password");
    expect(input?.autocomplete).toBe("off");
    // No value attribute is serialised into the markup.
    expect(target.innerHTML).not.toContain("value=");
  });
});
