import { AppController } from "./app.controller";
import { AppService } from "./app.service";

interface DashboardResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

interface DashboardRequest {
  method?: string;
  body?: string;
}

type DashboardFetch = (
  url: string,
  options?: DashboardRequest,
) => Promise<DashboardResponse>;

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

interface DashboardApp {
  authenticated: boolean;
  keyInput: string;
  loginError: string;
  loginLoading: boolean;
  settingsDocument: unknown;
  settingsRevision: number;
  settingsSaving: boolean;
  settingsStatus: string;
  settingsError: boolean;
  settingsForm: Record<string, string | number>;
  settingsSecrets: Record<string, string>;
  settingsClears: Record<string, boolean>;
  repositoryForm: Record<string, unknown>;
  repositoryLoadedIdentity: string;
  repos: unknown[];
  recentReviews: unknown[];
  recentLoading: boolean;
  expandedReviewId: number | null;
  expandedReviewOutput: string | null;
  expandedReviewError: string | null;
  expandedLoading: boolean;
  statusMessage: string;
  statusError: boolean;
  lastUpdated: Date | null;
  unlock(): Promise<void>;
  logout(): void;
  loadSettings(preserveGlobalDraft?: boolean): Promise<void>;
  loadStats(): Promise<void>;
  loadRecent(): Promise<void>;
  toggleReviewOutput(id: number): Promise<void>;
  loadRepositorySettings(): void;
  saveGlobalSettings(): Promise<void>;
  saveRepositorySettings(): Promise<void>;
}

function dashboardResponse(
  body: unknown,
  status = 200,
): DashboardResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function dashboardSettings(
  customPrompt: string,
  revision = 1,
  repositories: unknown[] = [],
): Record<string, unknown> {
  return {
    global: {
      revision,
      values: {
        model: "gpt-5.3-codex",
        reasoningEffort: "high",
        timeoutMs: 600000,
        customPrompt,
        openaiBaseUrl: "",
        triggerMode: "mention",
        retryAttempts: 3,
        retryDelay: 5000,
        workerConcurrency: 3,
        cloneTimeoutMs: 600000,
      },
      secrets: {
        openaiApiKey: { configured: true, source: "global" },
        bitbucketApiToken: { configured: true, source: "global" },
        webhookSecret: { configured: true, source: "global" },
      },
      basicCredentialConfigured: true,
    },
    repositories,
  };
}

function createDashboardApp(
  script: string,
  dashboardFetch: DashboardFetch,
): DashboardApp {
  let factory: (() => DashboardApp) | undefined;
  const document = {
    addEventListener(event: string, listener: () => void) {
      if (event === "alpine:init") listener();
    },
    removeEventListener: jest.fn(),
    hidden: false,
    documentElement: {
      dataset: {},
      setAttribute: jest.fn(),
    },
  };
  const window = {
    location: { hash: "" },
    innerWidth: 1200,
    localStorage: {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
    },
    matchMedia: jest.fn(() => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
  const Alpine = {
    data(_name: string, dashboardFactory: () => DashboardApp) {
      factory = dashboardFactory;
    },
  };

  const installDashboard = new Function(
    "Alpine",
    "document",
    "window",
    "fetch",
    "setInterval",
    "clearInterval",
    script,
  );
  installDashboard(
    Alpine,
    document,
    window,
    dashboardFetch,
    () => 1,
    jest.fn(),
  );
  if (!factory) throw new Error("Dashboard app was not registered");
  return factory();
}

function deferred<T>(): Deferred<T> {
  let resolve = (_value: T): void => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("AppController", () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(() => {
    appService = new AppService();
    appController = new AppController(appService);
  });

  it("should return health text", () => {
    expect(appController.getHealth()).toBe("Code Review Service is healthy");
  });

  it("should return dashboard html document", () => {
    const html = appController.getDashboard();

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="ko" data-bs-theme="auto">');
    expect(html).toContain('src="/dashboard.js"');
    expect(html).toContain('src="/dashboard-alpine.js"');
    expect(html).toContain("코드 리뷰 통계 대시보드");
    expect(html).toContain("https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css");
    expect(html).toContain('x-data="dashboardApp()"');
    expect(html).toContain('aria-label="사이드 메뉴"');
    expect(html).toContain('id="theme-toggle"');
    expect(html).toContain('aria-label="자동 테마"');
    expect(html).toContain("(prefers-color-scheme: dark)");
    expect(html).toContain("저장소 작업량");
  });

  it("renders the public lock shell before protected dashboard content", () => {
    const html = appController.getDashboard();

    expect(html).toContain('id="dashboard-secret-key"');
    expect(html).toContain('@submit.prevent="unlock()"');
    expect(html).toContain(":class=\"{ 'd-none': !authenticated }\"");
    expect(html).toContain("Runtime 설정");
    expect(html).toContain("삭제하고 global 상속");
  });

  it("clears dashboard secrets and sensitive drafts when locked", () => {
    const app = createDashboardApp(
      appController.getDashboardScript(),
      async () => dashboardResponse({}),
    );
    app.authenticated = true;
    Object.assign(app.settingsForm, {
      model: "private-model",
      customPrompt: "private global prompt",
      openaiBaseUrl: "https://private.example",
    });
    Object.assign(app.settingsSecrets, {
      openaiApiKey: "fake-openai-key",
      bitbucketApiToken: "fake-bitbucket-token",
      webhookSecret: "fake-webhook-secret",
      username: "fake-user",
      appPassword: "fake-app-password",
    });
    Object.assign(app.settingsClears, {
      openaiApiKey: true,
      bitbucketApiToken: true,
      webhookSecret: true,
      basicCredential: true,
    });
    app.settingsRevision = 41;
    app.settingsSaving = true;
    app.settingsStatus = "private status";
    app.settingsError = true;
    Object.assign(app.repositoryForm, {
      workspaceSlug: "workspace",
      repositorySlug: "repository",
      customPrompt: "private repository prompt",
      bitbucketApiToken: "fake-repository-token",
      webhookSecret: "fake-repository-secret",
      bitbucketApiTokenClear: true,
      webhookSecretClear: true,
    });

    app.logout();

    expect(app.authenticated).toBe(false);
    expect(app.settingsDocument).toBeNull();
    expect(app.settingsRevision).toBe(0);
    expect(app.settingsSaving).toBe(false);
    expect(app.settingsStatus).toBe("");
    expect(app.settingsError).toBe(false);
    expect(app.settingsForm).toEqual({
      model: "",
      reasoningEffort: "",
      timeoutMs: 600000,
      customPrompt: "",
      openaiBaseUrl: "",
      triggerMode: "mention",
      retryAttempts: 3,
      retryDelay: 5000,
      workerConcurrency: 3,
      cloneTimeoutMs: 600000,
    });
    expect(app.settingsSecrets).toEqual({
      openaiApiKey: "",
      bitbucketApiToken: "",
      webhookSecret: "",
      username: "",
      appPassword: "",
    });
    expect(app.settingsClears).toEqual({
      openaiApiKey: false,
      bitbucketApiToken: false,
      webhookSecret: false,
      basicCredential: false,
    });
    expect(app.repositoryForm).toMatchObject({
      workspaceSlug: "",
      repositorySlug: "",
      customPrompt: "",
      bitbucketApiToken: "",
      webhookSecret: "",
      bitbucketApiTokenClear: false,
      webhookSecretClear: false,
    });
  });

  it("clears dashboard secrets and sensitive drafts after a 401", async () => {
    let rejectSave = false;
    const fetchDashboard: DashboardFetch = async (url, options) => {
      if (rejectSave && options?.method === "PATCH") {
        return dashboardResponse({}, 401);
      }
      if (url === "/api/internal/settings") {
        return dashboardResponse(dashboardSettings("loaded prompt"));
      }
      return dashboardResponse([]);
    };
    const app = createDashboardApp(
      appController.getDashboardScript(),
      fetchDashboard,
    );
    app.keyInput = "valid-dashboard-key";
    await app.unlock();
    expect(app.authenticated).toBe(true);

    app.settingsForm.customPrompt = "unsaved private prompt";
    Object.assign(app.settingsSecrets, {
      openaiApiKey: "fake-openai-key",
      bitbucketApiToken: "fake-bitbucket-token",
      webhookSecret: "fake-webhook-secret",
      username: "fake-user",
      appPassword: "fake-app-password",
    });
    app.settingsClears.openaiApiKey = true;
    Object.assign(app.repositoryForm, {
      customPrompt: "unsaved repository prompt",
      bitbucketApiToken: "fake-repository-token",
      webhookSecret: "fake-repository-secret",
      bitbucketApiTokenClear: true,
      webhookSecretClear: true,
    });
    rejectSave = true;
    await app.saveGlobalSettings();

    expect(app.authenticated).toBe(false);
    expect(app.settingsForm.customPrompt).toBe("");
    expect(Object.values(app.settingsSecrets)).toEqual(["", "", "", "", ""]);
    expect(Object.values(app.settingsClears)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(app.repositoryForm).toMatchObject({
      customPrompt: "",
      bitbucketApiToken: "",
      webhookSecret: "",
      bitbucketApiTokenClear: false,
      webhookSecretClear: false,
    });
    expect(app.settingsRevision).toBe(0);
    expect(app.settingsStatus).toBe("");
    expect(app.settingsError).toBe(false);
  });

  it("does not let a deferred unlock replace a newer session", async () => {
    const firstUnlockResponse = deferred<DashboardResponse>();
    let deferFirstUnlock = true;
    const fetchDashboard: DashboardFetch = (url) => {
      if (url === "/api/internal/settings") {
        if (deferFirstUnlock) {
          deferFirstUnlock = false;
          return firstUnlockResponse.promise;
        }
        return Promise.resolve(
          dashboardResponse(dashboardSettings("new session", 2)),
        );
      }
      return Promise.resolve(dashboardResponse([]));
    };
    const app = createDashboardApp(
      appController.getDashboardScript(),
      fetchDashboard,
    );
    app.keyInput = "first-key";
    const firstUnlock = app.unlock();

    app.keyInput = "second-key";
    await app.unlock();
    firstUnlockResponse.resolve(
      dashboardResponse(dashboardSettings("stale private prompt", 99)),
    );
    await firstUnlock;

    expect(app.authenticated).toBe(true);
    expect(app.loginLoading).toBe(false);
    expect(app.settingsRevision).toBe(2);
    expect(app.settingsForm.customPrompt).toBe("new session");
  });

  it("ignores deferred responses from a locked session after re-unlock", async () => {
    let currentSettings = dashboardSettings("first session");

    let deferOldRequests = false;
    const pending: Array<{
      url: string;
      response: Deferred<DashboardResponse>;
    }> = [];
    const fetchDashboard: DashboardFetch = (url) => {
      if (deferOldRequests) {
        const response = deferred<DashboardResponse>();
        pending.push({ url, response });
        return response.promise;
      }
      if (url === "/api/internal/settings") {
        return Promise.resolve(dashboardResponse(currentSettings));
      }
      if (url === "/api/internal/stats/repos") {
        return Promise.resolve(dashboardResponse([{ session: "new" }]));
      }
      if (url.includes("/recent")) {
        return Promise.resolve(dashboardResponse([{ session: "new" }]));
      }
      if (url.startsWith("/api/internal/reviews/")) {
        return Promise.resolve(dashboardResponse({ reviewOutput: "new output" }));
      }
      return Promise.resolve(dashboardResponse([{ session: "new" }]));
    };
    const app = createDashboardApp(
      appController.getDashboardScript(),
      fetchDashboard,
    );
    app.keyInput = "first-key";
    await app.unlock();

    deferOldRequests = true;
    const oldRequests = [
      app.loadSettings(),
      app.loadStats(),
      app.loadRecent(),
      app.toggleReviewOutput(17),
    ];
    expect(pending).toHaveLength(4);

    app.logout();
    deferOldRequests = false;
    currentSettings = dashboardSettings("second session", 2);
    app.keyInput = "second-key";
    await app.unlock();
    expect(app.authenticated).toBe(true);

    for (const request of pending) {
      if (request.url === "/api/internal/settings") {
        request.response.resolve(
          dashboardResponse(dashboardSettings("stale private prompt", 99)),
        );
      } else if (request.url === "/api/internal/stats/repos") {
        request.response.resolve(
          dashboardResponse([{ session: "stale" }]),
        );
      } else if (request.url.includes("/recent")) {
        request.response.resolve(
          dashboardResponse([{ session: "stale" }]),
        );
      } else {
        request.response.resolve(dashboardResponse({}, 401));
      }
    }
    await Promise.allSettled(oldRequests);

    expect(app.authenticated).toBe(true);
    expect(app.settingsRevision).toBe(2);
    expect(app.settingsForm.customPrompt).toBe("second session");
    expect(app.repos).toEqual([{ session: "new" }]);
    expect(app.recentReviews).toEqual([{ session: "new" }]);
    expect(app.expandedReviewId).toBeNull();
    expect(app.expandedReviewOutput).toBeNull();
  });

  it.each([
    { save: "global" as const, patchStatus: 200 },
    { save: "repository" as const, patchStatus: 409 },
  ])(
    "does not refresh a new session after a deferred $save save",
    async ({ save, patchStatus }) => {
      const repository = {
        workspaceSlug: "workspace",
        repositorySlug: "repository",
        revision: 3,
        values: {
          model: null,
          reasoningEffort: null,
          timeoutMs: null,
          customPrompt: "old repository prompt",
        },
        secrets: {
          bitbucketApiToken: { configured: false },
          webhookSecret: { configured: false },
        },
      };
      const staleRepository = {
        ...repository,
        revision: 99,
        values: {
          ...repository.values,
          customPrompt: "stale repository prompt",
        },
      };
      const patchResponse = deferred<DashboardResponse>();
      const settingsRequests: Array<Deferred<DashboardResponse>> = [];
      let deferSettings = false;
      const fetchDashboard: DashboardFetch = (url, options) => {
        if (options?.method === "PATCH") return patchResponse.promise;
        if (url === "/api/internal/settings") {
          if (deferSettings) {
            const response = deferred<DashboardResponse>();
            settingsRequests.push(response);
            return response.promise;
          }
          return Promise.resolve(
            dashboardResponse(dashboardSettings("old global prompt", 1, [
              repository,
            ])),
          );
        }
        return Promise.resolve(dashboardResponse([]));
      };
      const app = createDashboardApp(
        appController.getDashboardScript(),
        fetchDashboard,
      );
      app.keyInput = "old-key";
      await app.unlock();
      if (save === "repository") {
        app.repositoryForm.workspaceSlug = "workspace";
        app.repositoryForm.repositorySlug = "repository";
        app.loadRepositorySettings();
      }

      deferSettings = true;
      const oldSave = save === "global"
        ? app.saveGlobalSettings()
        : app.saveRepositorySettings();
      let newUnlock = Promise.resolve();
      patchResponse.resolve(dashboardResponse({}, patchStatus));
      queueMicrotask(() => {
        app.logout();
        app.keyInput = "new-key";
        newUnlock = app.unlock();
      });
      await Promise.resolve();

      expect(settingsRequests).toHaveLength(1);
      settingsRequests[0].resolve(
        dashboardResponse(dashboardSettings("new loaded prompt", 2, [
          repository,
        ])),
      );
      await newUnlock;
      if (save === "global") {
        app.settingsForm.customPrompt = "new global draft";
        app.settingsSecrets.openaiApiKey = "new global secret";
      } else {
        Object.assign(app.repositoryForm, {
          workspaceSlug: "workspace",
          repositorySlug: "repository",
          customPrompt: "new repository draft",
          webhookSecret: "new repository secret",
        });
      }

      settingsRequests[1]?.resolve(
        dashboardResponse(dashboardSettings("stale global prompt", 99, [
          staleRepository,
        ])),
      );
      await oldSave;

      expect(settingsRequests).toHaveLength(1);
      expect(app.authenticated).toBe(true);
      if (save === "global") {
        expect(app.settingsForm.customPrompt).toBe("new global draft");
        expect(app.settingsSecrets.openaiApiKey).toBe("new global secret");
      } else {
        expect(app.repositoryForm).toMatchObject({
          customPrompt: "new repository draft",
          webhookSecret: "new repository secret",
        });
      }
    },
  );

  it("keeps successful unlock and settings saves working", async () => {
    const repository = {
      workspaceSlug: "workspace",
      repositorySlug: "repository",
      revision: 3,
      values: {
        model: null,
        reasoningEffort: null,
        timeoutMs: null,
        customPrompt: "old repository prompt",
      },
      secrets: {
        bitbucketApiToken: { configured: false },
        webhookSecret: { configured: false },
      },
    };
    let currentSettings = dashboardSettings("old global prompt", 1, [
      repository,
    ]);
    let globalPatch: Record<string, unknown> | undefined;
    let repositoryPatch: Record<string, unknown> | undefined;
    const fetchDashboard: DashboardFetch = async (url, options) => {
      if (options?.method === "PATCH") {
        const patch = JSON.parse(options.body || "{}") as Record<string, unknown>;
        if (url.endsWith("/global")) {
          globalPatch = patch;
          currentSettings = dashboardSettings("new global prompt", 2, [
            repository,
          ]);
        } else {
          repositoryPatch = patch;
          repository.revision = 4;
          repository.values.customPrompt = "new repository prompt";
        }
        return dashboardResponse({});
      }
      if (url === "/api/internal/settings") {
        return dashboardResponse(currentSettings);
      }
      return dashboardResponse([]);
    };
    const app = createDashboardApp(
      appController.getDashboardScript(),
      fetchDashboard,
    );
    app.keyInput = "valid-dashboard-key";
    await app.unlock();

    app.settingsForm.customPrompt = "new global prompt";
    app.settingsSecrets.openaiApiKey = "replacement-openai-key";
    app.settingsSecrets.username = "replacement-user";
    app.settingsSecrets.appPassword = "replacement-password";
    await app.saveGlobalSettings();

    expect(app.authenticated).toBe(true);
    expect(app.settingsRevision).toBe(2);
    expect(globalPatch).toMatchObject({
      expectedRevision: 1,
      values: { customPrompt: "new global prompt" },
      secrets: {
        openaiApiKey: {
          operation: "replace",
          value: "replacement-openai-key",
        },
      },
      basicCredential: {
        operation: "replace",
        username: "replacement-user",
        appPassword: "replacement-password",
      },
    });

    app.repositoryForm.workspaceSlug = "workspace";
    app.repositoryForm.repositorySlug = "repository";
    app.loadRepositorySettings();
    app.repositoryForm.customPrompt = "new repository prompt";
    app.repositoryForm.bitbucketApiToken = "replacement-repository-token";
    await app.saveRepositorySettings();

    expect(app.authenticated).toBe(true);
    expect(repositoryPatch).toMatchObject({
      expectedRevision: 3,
      values: { customPrompt: "new repository prompt" },
      secrets: {
        bitbucketApiToken: {
          operation: "replace",
          value: "replacement-repository-token",
        },
      },
    });
    expect(app.repositoryForm).toMatchObject({
      revision: 4,
      customPrompt: "new repository prompt",
      bitbucketApiToken: "",
    });
  });

  it("returns syntactically valid dashboard JavaScript", () => {
    expect(() => new Function(appController.getDashboardScript())).not.toThrow();
  });

  it("should return local alpine runtime script", () => {
    const script = appController.getDashboardAlpineScript();

    expect(script.length).toBeGreaterThan(1000);
    expect(script).toContain("MutationObserver");
  });
});
