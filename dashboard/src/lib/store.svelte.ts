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

    const response = await fetch(`/api/internal${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${key}`,
        ...(init?.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
    });

    // Staleness is checked before the status: a 401 answering a request from a
    // session that has already been replaced must not lock the session that
    // replaced it. (Invariant 4 before invariant 3.)
    if (issued !== this.#session) throw new StaleSessionError();

    if (response.status === 401) {
      this.lock("Key rejected. Enter it again.");
      throw new StaleSessionError();
    }
    if (!response.ok) {
      throw new ApiError(response.status, await readError(response));
    }
    return (await response.json()) as T;
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
    try {
      this.detail = await this.#request<ReviewDetail | null>(`/reviews/${id}`);
      if (this.detail === null) this.detailError = "Review run not found.";
    } catch (error) {
      if (error instanceof StaleSessionError) return;
      this.detailError = describe(error);
    } finally {
      if (issued === this.#session) this.detailLoading = false;
    }
  }

  closeReview(): void {
    this.detail = null;
    this.detailError = null;
  }

  async loadSettings(): Promise<void> {
    const issued = this.#session;
    try {
      const settings = await this.#request<SettingsDocument>("/settings");
      this.settings = settings;
      this.hydrateGlobalDraft();
      if (this.repositoryLoadedIdentity !== null) {
        this.loadRepository(
          this.repositoryLoadedIdentity.workspaceSlug,
          this.repositoryLoadedIdentity.repositorySlug,
        );
      }
    } catch (error) {
      if (error instanceof StaleSessionError) return;
      if (issued === this.#session) this.loadError = describe(error);
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
      this.#applyScope(scope);
      report({ kind: "ok", text: `Saved at revision ${scope.revision}.` });
    } catch (error) {
      if (error instanceof StaleSessionError) return;
      if (error instanceof ApiError && error.status === 409) {
        // CAS lost. Never retried silently: reload the document and say the
        // write did not apply, so the user re-applies against what is there
        // now. (Invariant 6.)
        report({
          kind: "conflict",
          text: "Not saved — changed elsewhere since load. Reloaded; re-apply your edits.",
        });
        await this.loadSettings();
        return;
      }
      report({ kind: "error", text: describe(error) });
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
