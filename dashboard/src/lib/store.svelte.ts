import {
  GLOBAL_SECRET_KEYS,
  GLOBAL_VALUE_KEYS,
  REPOSITORY_SECRET_KEYS,
  REPOSITORY_VALUE_KEYS,
  coerceValue,
  valueToInput,
} from "./fields";
import type {
  RecentReview,
  RepoStats,
  ReviewDetail,
  SettingsDocument,
  SettingsScope,
} from "./wire";

/**
 * Thrown for any response that no longer belongs to the live session — a
 * response that arrived after a lock or re-unlock, or a 401 that has already
 * been turned into a lock. Callers swallow it: there is no session left to
 * report an error to. (Spec invariant 4.)
 */
export class StaleSessionError extends Error {
  constructor() {
    super("Stale dashboard session");
    this.name = "StaleSessionError";
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type SecretOperation = "keep" | "replace" | "clear";

export type SecretDraft = { operation: SecretOperation; value: string };

export type RepositoryValueDraft = { inherit: boolean; value: string };

export type Notice = {
  kind: "ok" | "error" | "conflict";
  text: string;
};

export type View = "overview" | "settings";

function emptySecrets(keys: readonly string[]): Record<string, SecretDraft> {
  return Object.fromEntries(
    keys.map((key) => [key, { operation: "keep", value: "" } as SecretDraft]),
  );
}

function emptyGlobalDraft() {
  return {
    values: Object.fromEntries(GLOBAL_VALUE_KEYS.map((key) => [key, ""])),
    secrets: emptySecrets(GLOBAL_SECRET_KEYS),
    basicOperation: "keep" as SecretOperation,
    basicUsername: "",
    basicAppPassword: "",
  };
}

function emptyRepositoryDraft() {
  return {
    workspaceSlug: "",
    repositorySlug: "",
    values: Object.fromEntries(
      REPOSITORY_VALUE_KEYS.map((key) => [
        key,
        { inherit: true, value: "" } as RepositoryValueDraft,
      ]),
    ),
    secrets: emptySecrets(REPOSITORY_SECRET_KEYS),
  };
}

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string") return body.message;
    if (Array.isArray(body.message)) return body.message.join(", ");
  } catch {
    // Non-JSON error body; fall through to the status line.
  }
  return `${response.status} ${response.statusText}`;
}

export class DashboardStore {
  /**
   * The dashboard key. A `#` private field, never a `$state` one: it must not
   * be reachable from the instance, reach the DOM, or be persisted anywhere.
   * A reload therefore returns to the lock screen. (Invariant 1.)
   */
  #key: string | null = null;

  /**
   * Monotonic session id, bumped by every lock and unlock. A response is
   * discarded unless the counter still holds the value it had when the request
   * was issued. (Invariant 4.)
   */
  #session = 0;

  /**
   * Generation of the newest review-detail request. Ordering within a single
   * session, which #session cannot express.
   */
  #detailRequest = 0;

  /**
   * Bumped by every settings write that lands. A read issued before the write
   * carries the pre-write document, so applying it afterwards would put the
   * old revision back while the save's own notice still says it succeeded —
   * and the next edit would lose to a 409 it should never have seen. The
   * Refresh button and the Save buttons are gated on separate flags, so the
   * two can be in flight at once.
   */
  #settingsWrites = 0;

  locked = $state(true);
  unlocking = $state(false);
  authError = $state<string | null>(null);

  view = $state<View>("overview");
  loading = $state(false);
  loadError = $state<string | null>(null);

  repoStats = $state<RepoStats[]>([]);
  recent = $state<RecentReview[]>([]);
  recentLimit = $state(10);

  detail = $state<ReviewDetail | null>(null);
  detailError = $state<string | null>(null);
  detailLoading = $state(false);

  settings = $state<SettingsDocument | null>(null);
  globalDraft = $state(emptyGlobalDraft());
  repositoryDraft = $state(emptyRepositoryDraft());

  /**
   * Identity the loaded repository draft belongs to. Editing the workspace or
   * repository field invalidates the draft: the user must load again before a
   * save is allowed, so edits are never written to a repository they were not
   * typed against.
   */
  repositoryLoadedIdentity = $state<{
    workspaceSlug: string;
    repositorySlug: string;
  } | null>(null);

  globalNotice = $state<Notice | null>(null);
  repositoryNotice = $state<Notice | null>(null);

  get repositoryDraftStale(): boolean {
    const loaded = this.repositoryLoadedIdentity;
    return (
      loaded === null ||
      loaded.workspaceSlug !== this.repositoryDraft.workspaceSlug ||
      loaded.repositorySlug !== this.repositoryDraft.repositorySlug
    );
  }

  async #request<T>(path: string, init?: RequestInit): Promise<T> {
    const issued = this.#session;
    const key = this.#key;
    if (key === null) throw new StaleSessionError();

    // Staleness is checked before the status: a 401 answering a request from a
    // session that has already been replaced must not lock the session that
    // replaced it. (Invariant 4 before invariant 3.) #fresh covers the
    // rejection too, so a network failure belonging to the old session cannot
    // surface as the new one's error.
    const response = await this.#fresh(issued, () =>
      fetch(`/api/internal${path}`, {
        ...init,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${key}`,
          ...(init?.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
      }),
    );

    if (response.status === 401) {
      this.lock("Key rejected. Enter it again.");
      throw new StaleSessionError();
    }

    // Reading the body is a second await: headers can arrive before a lock and
    // the body after it. Neither a resolved payload nor a malformed body's
    // decode error may reach a caller that would write it into the replacement
    // session. (Invariant 4.)
    if (!response.ok) {
      const message = await this.#fresh(issued, () => readError(response));
      throw new ApiError(response.status, message);
    }
    return await this.#fresh(issued, () => response.json() as Promise<T>);
  }

  /**
   * Awaits one step that can settle after the session has moved on — the fetch
   * itself, or a body read — and rejects with StaleSessionError when it did.
   * Both settlement paths are checked: a network failure and a malformed
   * body's SyntaxError must not surface as the current session's error either.
   */
  async #fresh<R>(issued: number, step: () => Promise<R>): Promise<R> {
    try {
      const value = await step();
      if (issued !== this.#session) throw new StaleSessionError();
      return value;
    } catch (error) {
      if (issued !== this.#session) throw new StaleSessionError();
      throw error;
    }
  }

  /**
   * Drops the key and every document and draft derived from it, including the
   * secret inputs and the custom prompt textarea. Any 401 from any view lands
   * here, so a rejected key never leaves another view's content on screen.
   * (Invariants 1 and 3.)
   */
  lock(reason: string | null = null): void {
    this.#key = null;
    this.#session += 1;
    this.#clear();
    this.locked = true;
    this.unlocking = false;
    this.authError = reason;
  }

  #clear(): void {
    this.view = "overview";
    this.loading = false;
    this.loadError = null;
    this.repoStats = [];
    this.recent = [];
    this.detail = null;
    this.detailError = null;
    this.detailLoading = false;
    this.settings = null;
    this.globalDraft = emptyGlobalDraft();
    this.repositoryDraft = emptyRepositoryDraft();
    this.repositoryLoadedIdentity = null;
    this.globalNotice = null;
    this.repositoryNotice = null;
  }

  async unlock(key: string): Promise<void> {
    if (key === "") {
      this.authError = "Enter the dashboard key.";
      return;
    }
    this.#clear();
    this.#session += 1;
    this.#key = key;
    this.unlocking = true;
    const issued = this.#session;
    try {
      // /settings doubles as the key probe: it is the one document every view
      // needs, so a successful unlock costs no extra round trip.
      const settings = await this.#request<SettingsDocument>("/settings");
      this.settings = settings;
      this.hydrateGlobalDraft();
      this.locked = false;
      this.authError = null;
      await this.refresh();
    } catch (error) {
      // lock() has already set authError for a 401 or a superseded session.
      if (!(error instanceof StaleSessionError)) this.lock(describe(error));
    } finally {
      if (issued === this.#session) this.unlocking = false;
    }
  }

  /**
   * What the header Refresh button reloads: the documents the current view
   * shows. On the settings view that is the settings document itself, which is
   * what makes the button a real recovery path after a CAS reload failed — the
   * stale expectedRevision would otherwise survive every refresh and lose the
   * next save to the same conflict. It re-hydrates the drafts, so an explicit
   * Refresh discards unsaved edits exactly as the conflict reload does.
   */
  async refreshView(): Promise<void> {
    if (this.view !== "settings") {
      await this.refresh();
      return;
    }
    this.loading = true;
    const issued = this.#session;
    try {
      await this.loadSettings();
    } finally {
      if (issued === this.#session) this.loading = false;
    }
  }

  async refresh(): Promise<void> {
    this.loading = true;
    const issued = this.#session;
    try {
      const [stats, recent] = await Promise.all([
        this.#request<RepoStats[]>("/stats/repos"),
        this.#request<RecentReview[]>(
          `/reviews/recent?limit=${this.recentLimit}`,
        ),
      ]);
      this.repoStats = stats;
      this.recent = recent;
      this.loadError = null;
    } catch (error) {
      if (error instanceof StaleSessionError) return;
      this.loadError = describe(error);
    } finally {
      if (issued === this.#session) this.loading = false;
    }
  }

  async setRecentLimit(limit: number): Promise<void> {
    this.recentLimit = limit;
    await this.refresh();
  }

  /** One detail request per explicit row selection — never a per-row fan-out. */
  async openReview(id: number): Promise<void> {
    this.detail = null;
    this.detailError = null;
    this.detailLoading = true;
    const issued = this.#session;
    // Closing the drawer or picking another row happens inside one session, so
    // the session counter cannot order these: without its own generation an
    // in-flight response reopens a closed drawer or replaces a newer pick.
    const generation = ++this.#detailRequest;
    try {
      const detail = await this.#request<ReviewDetail | null>(`/reviews/${id}`);
      if (generation !== this.#detailRequest) return;
      this.detail = detail;
      if (detail === null) this.detailError = "Review run not found.";
    } catch (error) {
      if (error instanceof StaleSessionError) return;
      if (generation !== this.#detailRequest) return;
      this.detailError = describe(error);
    } finally {
      if (issued === this.#session && generation === this.#detailRequest) {
        this.detailLoading = false;
      }
    }
  }

  closeReview(): void {
    this.#detailRequest += 1;
    this.detail = null;
    this.detailError = null;
    this.detailLoading = false;
  }

  /**
   * @returns whether the document was replaced. A caller that tells the user
   * what the reload produced has to know: on failure the old document — and so
   * the old expectedRevision — is still in place.
   */
  async loadSettings(): Promise<boolean> {
    const issued = this.#session;
    const writes = this.#settingsWrites;
    try {
      const settings = await this.#request<SettingsDocument>("/settings");
      // A save committed while this read was in flight, so the read is older
      // than what is on screen. Reported as "not replaced": the caller that
      // asks is the conflict path, and telling it to refresh is safe.
      if (writes !== this.#settingsWrites) return false;
      this.settings = settings;
      this.hydrateGlobalDraft();
      if (this.repositoryLoadedIdentity !== null) {
        this.loadRepository(
          this.repositoryLoadedIdentity.workspaceSlug,
          this.repositoryLoadedIdentity.repositorySlug,
        );
      }
      // The banner is the one place a load failure is visible, so a load that
      // succeeds has to take it down — otherwise a recovered outage still
      // reads as "not loaded". refresh() clears it on the same grounds.
      this.loadError = null;
      return true;
    } catch (error) {
      if (error instanceof StaleSessionError) return false;
      if (issued === this.#session) this.loadError = describe(error);
      return false;
    }
  }

  hydrateGlobalDraft(): void {
    const scope = this.settings?.global;
    const draft = emptyGlobalDraft();
    if (scope !== undefined) {
      for (const key of GLOBAL_VALUE_KEYS) {
        draft.values[key] = valueToInput(scope.values[key]);
      }
    }
    // Secret inputs stay empty: the API returns status only, so there is no
    // value to prefill and nothing to accidentally re-submit. (Invariant 5.)
    this.globalDraft = draft;
  }

  /**
   * Copies a repository scope into the draft. An unknown repository is a valid
   * target — every field starts inherited, which is how a new override is
   * created.
   */
  loadRepository(workspaceSlug: string, repositorySlug: string): void {
    const scope = this.settings?.repositories.find(
      (candidate) =>
        candidate.workspaceSlug === workspaceSlug &&
        candidate.repositorySlug === repositorySlug,
    );
    const draft = emptyRepositoryDraft();
    draft.workspaceSlug = workspaceSlug;
    draft.repositorySlug = repositorySlug;
    for (const key of REPOSITORY_VALUE_KEYS) {
      const stored = scope?.values[key];
      draft.values[key] =
        stored === undefined || stored === null
          ? { inherit: true, value: "" }
          : { inherit: false, value: valueToInput(stored) };
    }
    this.repositoryDraft = draft;
    this.repositoryLoadedIdentity = { workspaceSlug, repositorySlug };
    this.repositoryNotice = null;
  }

  #secretPatch(
    draft: Record<string, SecretDraft>,
  ): Record<string, unknown> | undefined {
    const secrets: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(draft)) {
      if (entry.operation === "replace") {
        secrets[key] = { operation: "replace", value: entry.value };
      } else if (entry.operation === "clear") {
        secrets[key] = { operation: "clear" };
      }
    }
    return Object.keys(secrets).length === 0 ? undefined : secrets;
  }

  async saveGlobal(): Promise<void> {
    const scope = this.settings?.global;
    if (scope === undefined) return;

    const values: Record<string, unknown> = {};
    for (const key of GLOBAL_VALUE_KEYS) {
      values[key] = coerceValue(key, this.globalDraft.values[key] ?? "");
    }
    const draft = this.globalDraft;
    const patch = {
      expectedRevision: scope.revision,
      values,
      secrets: this.#secretPatch(draft.secrets),
      basicCredential:
        draft.basicOperation === "replace"
          ? {
              operation: "replace" as const,
              username: draft.basicUsername,
              appPassword: draft.basicAppPassword,
            }
          : draft.basicOperation === "clear"
            ? { operation: "clear" as const }
            : undefined,
    };

    await this.#save("/settings/global", patch, (notice) => {
      this.globalNotice = notice;
    });
  }

  async saveRepository(): Promise<void> {
    if (this.settings === null) return;
    if (this.repositoryDraftStale) {
      this.repositoryNotice = {
        kind: "error",
        text: "Repository changed since load. Load it again before saving.",
      };
      return;
    }
    const draft = this.repositoryDraft;
    const scope = this.settings.repositories.find(
      (candidate) =>
        candidate.workspaceSlug === draft.workspaceSlug &&
        candidate.repositorySlug === draft.repositorySlug,
    );

    const values: Record<string, unknown> = {};
    for (const key of REPOSITORY_VALUE_KEYS) {
      const entry = draft.values[key] ?? { inherit: true, value: "" };
      // null is "inherit from global"; "" is a stored empty value.
      values[key] = entry.inherit ? null : coerceValue(key, entry.value);
    }

    const patch = {
      expectedRevision: scope?.revision ?? 0,
      values,
      secrets: this.#secretPatch(draft.secrets),
    };

    await this.#save(
      `/settings/repositories/${encodeURIComponent(draft.workspaceSlug)}/${encodeURIComponent(draft.repositorySlug)}`,
      patch,
      (notice) => {
        this.repositoryNotice = notice;
      },
    );
  }

  async #save(
    path: string,
    patch: unknown,
    report: (notice: Notice) => void,
  ): Promise<void> {
    try {
      const scope = await this.#request<SettingsScope>(path, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      this.#settingsWrites += 1;
      this.#applyScope(scope);
      report({ kind: "ok", text: `Saved at revision ${scope.revision}.` });
      // The PATCH answers with the saved scope only, but a repository's secret
      // status is computed against the global secrets, so every stored
      // repository document is stale the moment a global secret changes.
      if (scope.scope === "global") await this.#syncRepositoryStatuses();
    } catch (error) {
      if (error instanceof StaleSessionError) return;
      if (error instanceof ApiError && error.status === 409) {
        // CAS lost. Never retried silently: reload the document and say the
        // write did not apply, so the user re-applies against what is there
        // now. (Invariant 6.) The notice is reported after the reload because
        // reloading a repository scope resets its notice, which would leave
        // the fields silently reverted with nothing on screen to explain it.
        const issued = this.#session;
        const reloaded = await this.loadSettings();
        // loadSettings() swallows a StaleSessionError, so without this guard a
        // lock and re-unlock during the reload would land this notice — and
        // the reverted fields it describes — in the replacement session.
        if (issued !== this.#session) return;
        // A failed reload leaves the stale document, and so the stale
        // expectedRevision, in place: claiming it reloaded would send the user
        // straight back into the same conflict.
        report(
          reloaded
            ? {
                kind: "conflict",
                text: "Not saved — changed elsewhere since load. Reloaded; re-apply your edits.",
              }
            : {
                kind: "error",
                text: "Not saved — changed elsewhere since load, and reloading the current values failed. Refresh before trying again.",
              },
        );
        return;
      }
      report({ kind: "error", text: describe(error) });
    }
  }

  /**
   * Re-reads the repository documents after a global save, for the inherited
   * secret status a global change invalidates. The repository draft is left
   * alone on purpose: only the displayed status is stale, and the operator may
   * have edits in that form. A failure here leaves the status as stale as it
   * already was, which is not something the operator could act on.
   */
  async #syncRepositoryStatuses(): Promise<void> {
    const issued = this.#session;
    const writes = this.#settingsWrites;
    try {
      const document = await this.#request<SettingsDocument>("/settings");
      if (issued !== this.#session || this.settings === null) return;
      if (writes !== this.#settingsWrites) return;
      this.settings = { ...this.settings, repositories: document.repositories };
    } catch {
      return;
    }
  }

  #applyScope(scope: SettingsScope): void {
    if (this.settings === null) return;
    if (scope.scope === "global") {
      this.settings = { ...this.settings, global: scope };
      this.hydrateGlobalDraft();
      return;
    }
    const others = this.settings.repositories.filter(
      (candidate) =>
        candidate.workspaceSlug !== scope.workspaceSlug ||
        candidate.repositorySlug !== scope.repositorySlug,
    );
    this.settings = { ...this.settings, repositories: [...others, scope] };
    this.loadRepository(scope.workspaceSlug, scope.repositorySlug);
  }
}

export const store = new DashboardStore();
