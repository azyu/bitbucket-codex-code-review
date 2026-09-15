import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.svelte";
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

  it("uses a password input, so the key is never rendered as text", () => {
    const input = target.querySelector<HTMLInputElement>("#dashboard-key");

    expect(input?.type).toBe("password");
    expect(input?.autocomplete).toBe("off");
    // No value attribute is serialised into the markup.
    expect(target.innerHTML).not.toContain("value=");
  });
});
