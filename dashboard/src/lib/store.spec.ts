import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardStore, StaleSessionError } from "./store.svelte";
import type { SettingsDocument } from "./wire";

const KEY = "a".repeat(32);

function scope(overrides: Record<string, unknown> = {}) {
  return {
    scope: "global",
    workspaceSlug: "",
    repositorySlug: "",
    revision: 4,
    values: { model: "gpt-5.6-sol", timeoutMs: 600_000, customPrompt: "" },
    secrets: {
      openaiApiKey: { configured: true, source: "global" },
      bitbucketApiToken: { configured: false, source: "unconfigured" },
      webhookSecret: { configured: false, source: "unconfigured" },
    },
    basicCredentialConfigured: false,
    updatedAt: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

function settings(): SettingsDocument {
  return {
    global: scope(),
    repositories: [
      scope({
        scope: "repository",
        workspaceSlug: "acme",
        repositorySlug: "api",
        revision: 2,
        values: { model: "gpt-5.6-pro", timeoutMs: null, customPrompt: null },
        secrets: {
          bitbucketApiToken: { configured: true, source: "repository" },
          webhookSecret: { configured: true, source: "global" },
        },
      }),
    ],
  } as SettingsDocument;
}

function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
  } as Response;
}

/** Resolves the fetch for `/settings`, `/stats/repos` and `/reviews/recent`. */
function unlockRoutes(): (input: string) => Response {
  return (input) => {
    if (input.includes("/settings")) return json(settings());
    if (input.includes("/stats/repos")) return json([]);
    return json([]);
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function unlocked(): Promise<DashboardStore> {
  const routes = unlockRoutes();
  fetchMock.mockImplementation((input: string) => routes(input));
  const store = new DashboardStore();
  await store.unlock(KEY);
  expect(store.locked).toBe(false);
  return store;
}

describe("invariant 1 — the key is memory-only", () => {
  it("starts locked, with nothing loaded", () => {
    const store = new DashboardStore();

    expect(store.locked).toBe(true);
    expect(store.settings).toBeNull();
    expect(store.repoStats).toEqual([]);
  });

  it("never writes the key to localStorage, sessionStorage or a cookie", async () => {
    const local = vi.spyOn(Storage.prototype, "setItem");
    const cookie = vi.spyOn(document, "cookie", "set");

    const store = await unlocked();
    await store.saveGlobal().catch(() => undefined);

    for (const [, value] of local.mock.calls) {
      expect(String(value)).not.toContain(KEY);
    }
    expect(cookie).not.toHaveBeenCalled();
    // And nothing reachable on the instance holds it either.
    expect(JSON.stringify(store)).not.toContain(KEY);
  });

  it("sends the key as a Bearer header and nothing else", async () => {
    await unlocked();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${KEY}`,
    );
    expect(init.cache).toBe("no-store");
  });

  it("makes no request once locked — the key is gone, not merely hidden", async () => {
    const store = await unlocked();
    const before = fetchMock.mock.calls.length;

    store.lock();
    await store.refresh();

    expect(fetchMock.mock.calls.length).toBe(before);
    expect(store.locked).toBe(true);
  });
});

describe("invariant 3 — a 401 clears every view, not just the failing one", () => {
  it("drops documents, drafts, secret inputs and the prompt textarea", async () => {
    const store = await unlocked();

    // Populate a draft in every shape the spec names.
    store.view = "settings";
    store.globalDraft.values["customPrompt"] = "review only the diff";
    store.globalDraft.secrets["openaiApiKey"] = {
      operation: "replace",
      value: "sk-should-not-survive",
    };
    store.globalDraft.basicOperation = "replace";
    store.globalDraft.basicUsername = "ops";
    store.globalDraft.basicAppPassword = "app-password";
    store.loadRepository("acme", "api");
    store.repositoryDraft.secrets["webhookSecret"] = {
      operation: "replace",
      value: "whsec-should-not-survive",
    };
    store.detail = { id: 7 } as never;

    // A 401 on an unrelated view's request.
    fetchMock.mockResolvedValue(json({ message: "Unauthorized" }, 401));
    await store.refresh();

    expect(store.locked).toBe(true);
    expect(store.authError).not.toBeNull();
    expect(store.settings).toBeNull();
    expect(store.repoStats).toEqual([]);
    expect(store.recent).toEqual([]);
    expect(store.detail).toBeNull();
    expect(store.repositoryLoadedIdentity).toBeNull();
    expect(store.globalDraft.values["customPrompt"]).toBe("");
    expect(store.globalDraft.secrets["openaiApiKey"]).toEqual({
      operation: "keep",
      value: "",
    });
    expect(store.globalDraft.basicOperation).toBe("keep");
    expect(store.globalDraft.basicUsername).toBe("");
    expect(store.globalDraft.basicAppPassword).toBe("");
    expect(store.repositoryDraft.secrets["webhookSecret"]).toEqual({
      operation: "keep",
      value: "",
    });
    expect(JSON.stringify(store)).not.toContain("should-not-survive");
  });

  it("locks on a 401 from a save, too", async () => {
    const store = await unlocked();

    fetchMock.mockResolvedValue(json({ message: "Unauthorized" }, 401));
    await store.saveGlobal();

    expect(store.locked).toBe(true);
    expect(store.globalNotice).toBeNull();
  });
});

describe("invariant 4 — a superseded session's response cannot mutate state", () => {
  it("discards a response that arrives after a lock", async () => {
    const store = await unlocked();

    let release = (_value: Response): void => undefined;
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (release = resolve)),
    );
    const inFlight = store.refresh();

    store.lock();
    release(json([{ workspaceSlug: "stale", repoSlug: "stale" }]));
    await inFlight;

    expect(store.repoStats).toEqual([]);
    expect(store.locked).toBe(true);
  });

  it("does not let a deferred 401 from an old session lock the new one", async () => {
    const store = await unlocked();

    let release = (_value: Response): void => undefined;
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (release = resolve)),
    );
    const inFlight = store.refresh();

    // Lock, then unlock again — two bumps of the session counter.
    store.lock();
    const routes = unlockRoutes();
    fetchMock.mockImplementation((input: string) => routes(input));
    await store.unlock(KEY);
    expect(store.locked).toBe(false);

    // The first session's 401 finally arrives.
    release(json({ message: "Unauthorized" }, 401));
    await inFlight;

    expect(store.locked).toBe(false);
    expect(store.settings).not.toBeNull();
  });

  it("reports nothing to a locked session instead of surfacing an error", async () => {
    const store = new DashboardStore();

    await store.openReview(1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.detailError).toBeNull();
    expect(store.detailLoading).toBe(false);
    expect(new StaleSessionError().name).toBe("StaleSessionError");
  });
});

describe("invariant 5 — secrets are status-only", () => {
  it("never prefills a secret input from the API", async () => {
    const store = await unlocked();

    for (const draft of Object.values(store.globalDraft.secrets)) {
      expect(draft).toEqual({ operation: "keep", value: "" });
    }
    expect(store.settings?.global.secrets["openaiApiKey"]).toEqual({
      configured: true,
      source: "global",
    });
  });

  it("clears the typed secret once the save succeeds", async () => {
    const store = await unlocked();
    store.globalDraft.secrets["openaiApiKey"] = {
      operation: "replace",
      value: "sk-live",
    };

    fetchMock.mockResolvedValue(json(scope({ revision: 5 })));
    await store.saveGlobal();

    expect(store.globalDraft.secrets["openaiApiKey"]).toEqual({
      operation: "keep",
      value: "",
    });
    expect(JSON.stringify(store)).not.toContain("sk-live");
  });

  it("omits untouched secrets from the patch entirely", async () => {
    const store = await unlocked();
    store.globalDraft.secrets["webhookSecret"] = {
      operation: "clear",
      value: "",
    };

    fetchMock.mockResolvedValue(json(scope({ revision: 5 })));
    await store.saveGlobal();

    const patch = JSON.parse(
      (fetchMock.mock.calls.at(-1)?.[1] as RequestInit).body as string,
    ) as { secrets: Record<string, unknown> };
    expect(patch.secrets).toEqual({ webhookSecret: { operation: "clear" } });
  });
});

describe("invariant 6 — CAS on every write, never a silent retry", () => {
  it("sends the loaded revision as expectedRevision", async () => {
    const store = await unlocked();

    fetchMock.mockResolvedValue(json(scope({ revision: 5 })));
    await store.saveGlobal();

    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe("/api/internal/settings/global");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toMatchObject({
      expectedRevision: 4,
    });
  });

  it("reloads and reports on a 409 without retrying the write", async () => {
    const store = await unlocked();
    const routes = unlockRoutes();

    let patches = 0;
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patches += 1;
        return json({ message: "Revision conflict" }, 409);
      }
      return routes(input);
    });

    await store.saveGlobal();

    expect(patches).toBe(1);
    expect(store.globalNotice?.kind).toBe("conflict");
    expect(store.globalNotice?.text).toContain("Not saved");
    expect(store.settings).not.toBeNull();
  });

  it("coerces integer fields and sends repository inherits as null", async () => {
    const store = await unlocked();
    store.loadRepository("acme", "api");
    store.repositoryDraft.values["timeoutMs"] = {
      inherit: false,
      value: "900000",
    };

    fetchMock.mockResolvedValue(
      json(scope({ scope: "repository", workspaceSlug: "acme", repositorySlug: "api" })),
    );
    await store.saveRepository();

    const patch = JSON.parse(
      (fetchMock.mock.calls.at(-1)?.[1] as RequestInit).body as string,
    ) as { values: Record<string, unknown> };
    expect(patch.values["timeoutMs"]).toBe(900_000);
    // customPrompt was inherited on load and stays inherited.
    expect(patch.values["customPrompt"]).toBeNull();
    // "" is a stored value, not an inherit.
    expect(patch.values["model"]).toBe("gpt-5.6-pro");
  });
});

describe("repository draft is bound to the identity it was loaded for", () => {
  it("refuses to save after the identity fields change", async () => {
    const store = await unlocked();
    store.loadRepository("acme", "api");
    expect(store.repositoryDraftStale).toBe(false);

    store.repositoryDraft.repositorySlug = "web";
    expect(store.repositoryDraftStale).toBe(true);

    const before = fetchMock.mock.calls.length;
    await store.saveRepository();

    expect(fetchMock.mock.calls.length).toBe(before);
    expect(store.repositoryNotice?.kind).toBe("error");
    expect(store.repositoryNotice?.text).toContain("Load it again");
  });

  it("loads an unconfigured repository as fully inherited", async () => {
    const store = await unlocked();

    store.loadRepository("acme", "brand-new");

    expect(store.repositoryDraftStale).toBe(false);
    for (const entry of Object.values(store.repositoryDraft.values)) {
      expect(entry).toEqual({ inherit: true, value: "" });
    }
  });
});

describe("error paths that are not 401", () => {
  it("rejects an empty key without a request", async () => {
    const store = new DashboardStore();

    await store.unlock("");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.locked).toBe(true);
    expect(store.authError).toBe("Enter the dashboard key.");
  });

  it("returns to the lock screen with the reason when unlock fails on a 500", async () => {
    fetchMock.mockResolvedValue(json({ message: "Database is down" }, 500));
    const store = new DashboardStore();

    await store.unlock(KEY);

    expect(store.locked).toBe(true);
    expect(store.authError).toBe("Database is down");
    expect(store.unlocking).toBe(false);
  });

  it("surfaces a non-JSON error body as its status line", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    const store = new DashboardStore();

    await store.unlock(KEY);

    expect(store.authError).toBe("502 Bad Gateway");
  });

  it("keeps the session on a failed refresh and reports it", async () => {
    const store = await unlocked();

    fetchMock.mockResolvedValue(json({ message: "Query timed out" }, 500));
    await store.refresh();

    expect(store.locked).toBe(false);
    expect(store.loadError).toBe("Query timed out");
    expect(store.loading).toBe(false);
  });

  it("reports a rejected save without clearing the draft", async () => {
    const store = await unlocked();
    store.globalDraft.values["model"] = "not a model!";

    fetchMock.mockResolvedValue(json({ message: "Invalid model" }, 400));
    await store.saveGlobal();

    expect(store.locked).toBe(false);
    expect(store.globalNotice).toEqual({
      kind: "error",
      text: "Invalid model",
    });
    // The edit survives so the user can correct it.
    expect(store.globalDraft.values["model"]).toBe("not a model!");
  });

  it("joins a validation error array into one message", async () => {
    const store = await unlocked();

    fetchMock.mockResolvedValue(
      json({ message: ["Invalid model", "Invalid timeoutMs"] }, 400),
    );
    await store.saveGlobal();

    expect(store.globalNotice?.text).toBe("Invalid model, Invalid timeoutMs");
  });

  it("reports a network failure rather than throwing out of the handler", async () => {
    const store = await unlocked();

    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await store.refresh();

    expect(store.loadError).toBe("Failed to fetch");
  });

  it("does nothing on a save with no settings loaded", async () => {
    const store = new DashboardStore();

    await store.saveGlobal();
    await store.saveRepository();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reloads the recent list when the limit changes", async () => {
    const store = await unlocked();

    await store.setRecentLimit(50);

    expect(store.recentLimit).toBe(50);
    expect(
      fetchMock.mock.calls.some(
        (call) => String(call[0]).includes("limit=50"),
      ),
    ).toBe(true);
  });
});

describe("review detail", () => {
  it("issues exactly one request per selection", async () => {
    const store = await unlocked();
    const before = fetchMock.mock.calls.length;

    fetchMock.mockResolvedValue(json({ id: 42, reviewStatus: "completed" }));
    await store.openReview(42);

    expect(fetchMock.mock.calls.length).toBe(before + 1);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/internal/reviews/42");
    expect(store.detail?.id).toBe(42);
  });

  it("reports a missing run instead of rendering an empty panel", async () => {
    const store = await unlocked();

    fetchMock.mockResolvedValue(json(null));
    await store.openReview(9999);

    expect(store.detail).toBeNull();
    expect(store.detailError).toBe("Review run not found.");
  });
});

describe("invariant 4 — the body is a second await, not just the headers", () => {
  // loadSettings() issues exactly one request. refresh() would mask the hole:
  // its sibling request fails the pre-status check and rejects the Promise.all
  // first, so the payload never reaches an assignment either way.
  it("discards a payload whose body finishes after the session was replaced", async () => {
    const store = await unlocked();

    // Headers arrive, then the operator locks while the body is still
    // downloading. The pre-status check has already passed at that point.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "",
      json: async () => {
        store.lock();
        return { global: scope({ values: { model: "leaked" } }), repositories: [] };
      },
    } as unknown as Response);

    await store.loadSettings();

    expect(store.locked).toBe(true);
    expect(store.settings).toBeNull();
    expect(store.globalDraft.values["model"]).toBe("");
    expect(JSON.stringify(store)).not.toContain("leaked");
  });

  // The save path reports through a callback that writes a notice with no
  // session guard of its own, so this is where an error body read after a lock
  // actually survives into the cleared store.
  it("does not surface an error body read after the session was replaced", async () => {
    const store = await unlocked();

    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => {
        store.lock();
        return { message: "leaked failure" };
      },
    } as unknown as Response);

    await store.saveGlobal();

    expect(store.locked).toBe(true);
    expect(store.globalNotice).toBeNull();
  });
});

describe("invariant 6 — the conflict notice survives its own reload", () => {
  it("keeps the repository conflict notice after the 409 reload", async () => {
    const store = await unlocked();
    store.loadRepository("acme", "api");

    const routes = unlockRoutes();
    fetchMock.mockImplementation((input: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? json({ message: "Runtime settings revision conflict" }, 409)
        : routes(input),
    );

    await store.saveRepository();

    // loadRepository() resets the notice, so reporting before the reload left
    // the fields silently reverted with nothing on screen to explain it.
    expect(store.repositoryNotice?.kind).toBe("conflict");
    expect(store.repositoryNotice?.text).toContain("Not saved");
  });
});

describe("review detail ordering within one session", () => {
  it("ignores a response that arrives after the drawer was closed", async () => {
    const store = await unlocked();

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "",
      json: async () => {
        store.closeReview();
        return { id: 42, reviewStatus: "completed" };
      },
    } as unknown as Response);

    await store.openReview(42);

    expect(store.detail).toBeNull();
    expect(store.detailLoading).toBe(false);
  });

  it("keeps the newest selection when an older request resolves last", async () => {
    const store = await unlocked();
    let releaseFirst: () => void = () => undefined;
    const firstBody = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    fetchMock.mockImplementation(
      (input: string) =>
        ({
          ok: true,
          status: 200,
          statusText: "",
          json: async () => {
            if (input.endsWith("/reviews/1")) {
              await firstBody;
              return { id: 1, reviewStatus: "completed" };
            }
            return { id: 2, reviewStatus: "completed" };
          },
        }) as unknown as Response,
    );

    const first = store.openReview(1);
    const second = store.openReview(2);
    await second;
    releaseFirst();
    await first;

    expect(store.detail?.id).toBe(2);
  });
});
