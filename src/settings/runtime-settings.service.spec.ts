import { ConflictException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FindOperator, Repository } from "typeorm";
import { RuntimeSettingEntity } from "../entities/runtime-setting.entity";
import { RuntimeSettingsService } from "./runtime-settings.service";
import * as fsPromises from "node:fs/promises";

function createRepository() {
  const rows = new Map<string, RuntimeSettingEntity>();
  const repository = {
    exist: async ({ where }: { where: { scopeKey: string } }) => rows.has(where.scopeKey),
    find: async () => [...rows.values()].sort((a, b) => a.scopeKey.localeCompare(b.scopeKey)),
    findBy: async ({ scopeKey }: { scopeKey: FindOperator<string> }) => {
      const keys = scopeKey.value as unknown as string[];
      return [...rows.values()].filter((row) => keys.includes(row.scopeKey));
    },
    findOneBy: async ({ scopeKey }: { scopeKey: string }) => rows.get(scopeKey) ?? null,
    findOneByOrFail: async ({ scopeKey }: { scopeKey: string }) => {
      const row = rows.get(scopeKey);
      if (!row) throw new Error("missing row");
      return row;
    },
    create: (value: Partial<RuntimeSettingEntity>) => Object.assign(new RuntimeSettingEntity(), value),
    insert: async (value: Partial<RuntimeSettingEntity>) => {
      if (!value.scopeKey || rows.has(value.scopeKey)) throw new Error("duplicate");
      rows.set(
        value.scopeKey,
        Object.assign(new RuntimeSettingEntity(), value, {
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        }),
      );
      return { identifiers: [{ scopeKey: value.scopeKey }] };
    },
    update: async (
      criteria: { scopeKey: string; revision: number },
      patch: Partial<RuntimeSettingEntity> & { revision?: () => string },
    ) => {
      const row = rows.get(criteria.scopeKey);
      if (!row || row.revision !== criteria.revision) return { affected: 0 };
      Object.assign(row, patch, {
        revision: row.revision + 1,
        updatedAt: new Date("2026-01-01T00:00:01Z"),
      });
      return { affected: 1 };
    },
  };
  const insertBuilder = {
    value: {} as Partial<RuntimeSettingEntity>,
    insert() {
      return this;
    },
    values(value: Partial<RuntimeSettingEntity>) {
      this.value = value;
      return this;
    },
    orIgnore() {
      return this;
    },
    async execute() {
      if (!this.value.scopeKey || rows.has(this.value.scopeKey)) {
        return { raw: { affectedRows: 0 } };
      }
      await repository.insert(this.value);
      return { raw: { affectedRows: 1 } };
    },
  };
  Object.assign(repository, {
    createQueryBuilder: () => Object.assign(Object.create(insertBuilder), {
      value: {},
    }),
  });
  const manager = {
    transaction: async <T>(
      work: (manager: { getRepository(): typeof repository }) => Promise<T>,
    ) => work({ getRepository: () => repository }),
  };
  Object.assign(repository, { manager });
  return {
    repository: repository as unknown as Repository<RuntimeSettingEntity>,
    rows,
  };
}

function createService(
  configOverrides: Record<string, unknown> = {},
  store = createRepository(),
) {
  const { repository, rows } = store;
  const values: Record<string, unknown> = {
    "runtimeSettings.encryptionKey": "0123456789abcdef0123456789abcdef",
    "runtimeSettings.repositoryWorkspaceMap": {},
    "codex.model": "gpt-5.6-sol",
    "codex.reasoningEffort": "medium",
    "codex.timeoutMs": 300_000,
    "codex.customPromptFilepath": "",
    "codex.repoCustomPromptFilepaths": {},
    "openai.apiKey": "global-openai-secret",
    "openai.baseUrl": "https://api.openai.example/v1",
    "trigger.mode": "mention",
    "queue.retryAttempts": 3,
    "queue.retryDelay": 5000,
    "workspace.maxConcurrent": 3,
    "workspace.cloneTimeoutMs": 600_000,
    "bitbucket.apiToken": "global-bitbucket-secret",
    "bitbucket.repoTokens": {},
    "bitbucket.webhookSecret": "global-webhook-secret",
    "bitbucket.repoWebhookSecrets": {},
    "bitbucket.username": "legacy-user",
    "bitbucket.appPassword": "legacy-password",
    ...configOverrides,
  };
  const config = {
    getOrThrow: (key: string) => {
      if (!(key in values)) throw new Error(`missing ${key}`);
      return values[key];
    },
    get: (key: string, fallback?: unknown) =>
      key in values ? values[key] : fallback,
  } as ConfigService;
  return {
    service: new RuntimeSettingsService(repository, config),
    rows,
  };
}

describe("RuntimeSettingsService", () => {
  it("encrypts secrets, redacts responses, and separates identical repo slugs by workspace", async () => {
    const { service, rows } = createService();
    await service.onApplicationBootstrap();
    await service.updateRepository(
      { workspaceSlug: "workspace-a", repositorySlug: "shared" },
      {
        expectedRevision: 0,
        secrets: {
          bitbucketApiToken: { operation: "replace", value: "workspace-a-token" },
        },
      },
    );
    await service.updateRepository(
      { workspaceSlug: "workspace-b", repositorySlug: "shared" },
      {
        expectedRevision: 0,
        secrets: {
          bitbucketApiToken: { operation: "replace", value: "workspace-b-token" },
        },
      },
    );

    const document = await service.getSettingsDocument();
    const serialized = JSON.stringify(document);
    expect(serialized).not.toContain("global-openai-secret");
    expect(serialized).not.toContain("workspace-a-token");
    expect(document.global.basicCredentialConfigured).toBe(true);
    expect(document.repositories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceSlug: "workspace-a",
          repositorySlug: "shared",
          secrets: expect.objectContaining({
            bitbucketApiToken: { configured: true, source: "repository" },
          }),
        }),
      ]),
    );
    expect(rows.get("global")?.encryptedSecrets).not.toContain(
      "global-openai-secret",
    );
    await expect(
      service.resolveJobCredentials({
        workspaceSlug: "workspace-a",
        repositorySlug: "shared",
      }),
    ).resolves.toMatchObject({
      bitbucket: {
        apiTokens: ["workspace-a-token", "global-bitbucket-secret"],
      },
      openai: {
        apiKey: "global-openai-secret",
        baseUrl: "https://api.openai.example/v1",
      },
    });
    await expect(
      service.resolveJobCredentials({
        workspaceSlug: "workspace-b",
        repositorySlug: "shared",
      }),
    ).resolves.toMatchObject({
      bitbucket: {
        apiTokens: ["workspace-b-token", "global-bitbucket-secret"],
      },
    });
  });

  it("allows exactly one concurrent update for a revision", async () => {
    const { service } = createService();
    await service.onApplicationBootstrap();

    const results = await Promise.allSettled([
      service.updateGlobal({
        expectedRevision: 1,
        values: { model: "gpt-first" },
      }),
      service.updateGlobal({
        expectedRevision: 1,
        values: { model: "gpt-second" },
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );
    expect(rejected).toMatchObject({
      reason: expect.any(ConflictException),
    });
    expect(JSON.stringify(rejected?.reason.getResponse())).not.toContain(
      "global-openai-secret",
    );
  });

  it("rejects insecure OpenAI endpoints and partial Basic credentials", async () => {
    const { service } = createService();
    await service.onApplicationBootstrap();

    await expect(
      service.updateGlobal({
        expectedRevision: 1,
        values: { openaiBaseUrl: "http://api.openai.example/v1" },
      }),
    ).rejects.toThrow("openaiBaseUrl must be an HTTPS URL");
    await expect(
      service.updateGlobal({
        expectedRevision: 1,
        basicCredential: {
          operation: "replace",
          username: "only-one-half",
        } as never,
      }),
    ).rejects.toThrow("username and appPassword must be replaced together");
  });

  it("refuses repository imports without an explicit workspace mapping", async () => {
    const { service, rows } = createService({
      "bitbucket.repoTokens": { shared: "secret" },
    });

    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      "RUNTIME_SETTINGS_REPOSITORY_WORKSPACE_MAP is missing: shared",
    );
    expect(rows.size).toBe(0);
  });

  it("resolves repository overrides and restores global inheritance after clear", async () => {
    const { service } = createService();
    await service.onApplicationBootstrap();
    const identity = {
      workspaceSlug: "workspace-a",
      repositorySlug: "repository-a",
    };

    await service.updateRepository(identity, {
      expectedRevision: 0,
      values: {
        model: "gpt-repository",
        timeoutMs: 120_000,
        customPrompt: "Repository prompt",
      },
      secrets: {
        webhookSecret: { operation: "replace", value: "repository-webhook" },
      },
    });

    await expect(
      service.resolveReviewSettings(identity, "gpt-cli-override"),
    ).resolves.toMatchObject({
      revision: "1:1",
      model: "gpt-cli-override",
      timeoutMs: 120_000,
      customPrompt: "Repository prompt",
    });
    await expect(service.resolveWebhookSecret(identity)).resolves.toBe(
      "repository-webhook",
    );

    await service.updateRepository(identity, {
      expectedRevision: 1,
      values: {
        model: null,
        timeoutMs: null,
        customPrompt: null,
      },
      secrets: {
        webhookSecret: { operation: "clear" },
      },
    });

    await expect(service.resolveReviewSettings(identity)).resolves.toMatchObject({
      revision: "1:2",
      model: "gpt-5.6-sol",
      timeoutMs: 300_000,
      customPrompt: "",
    });
    await expect(service.resolveWebhookSecret(identity)).resolves.toBe(
      "global-webhook-secret",
    );
  });

  it("replaces and clears the atomic global Basic credential", async () => {
    const { service } = createService();
    await service.onApplicationBootstrap();
    const identity = { workspaceSlug: "workspace", repositorySlug: "repo" };

    await service.updateGlobal({
      expectedRevision: 1,
      basicCredential: {
        operation: "replace",
        username: "replacement-user",
        appPassword: "replacement-password",
      },
    });
    await expect(service.resolveJobCredentials(identity)).resolves.toMatchObject({
      bitbucket: {
        username: "replacement-user",
        appPassword: "replacement-password",
      },
    });

    const cleared = await service.updateGlobal({
      expectedRevision: 2,
      basicCredential: { operation: "clear" },
      secrets: {
        openaiApiKey: { operation: "clear" },
      },
      values: { openaiBaseUrl: "" },
    });
    expect(cleared.basicCredentialConfigured).toBe(false);
    await expect(service.resolveJobCredentials(identity)).resolves.toMatchObject({
      bitbucket: { username: undefined, appPassword: undefined },
      openai: { apiKey: undefined, baseUrl: undefined },
    });
    await expect(service.getWorkerSettings()).resolves.toEqual({
      revision: 3,
      concurrency: 3,
    });
  });

  it("rejects malformed runtime setting patches at the API boundary", async () => {
    const { service } = createService();
    await service.onApplicationBootstrap();
    const identity = { workspaceSlug: "workspace", repositorySlug: "repo" };
    const invalidGlobalPatches = [
      [{ expectedRevision: -1 }, "expectedRevision"],
      [{ expectedRevision: 1, unexpected: true }, "Unknown field"],
      [{ expectedRevision: 1, values: { unknown: "value" } }, "Unknown setting"],
      [{ expectedRevision: 1, values: { model: "bad model" } }, "Invalid model"],
      [{ expectedRevision: 1, values: { model: "m".repeat(65) } }, "Invalid model"],
      [{ expectedRevision: 1, values: { customPrompt: "x".repeat(100_001) } }, "Invalid customPrompt"],
      [{ expectedRevision: 1, values: { reasoningEffort: "extreme" } }, "Invalid reasoningEffort"],
      [{ expectedRevision: 1, values: { triggerMode: "manual" } }, "Invalid triggerMode"],
      [{ expectedRevision: 1, values: { openaiBaseUrl: 1 } }, "Invalid openaiBaseUrl"],
      [{ expectedRevision: 1, values: { timeoutMs: 0 } }, "Invalid timeoutMs"],
      [{ expectedRevision: 1, values: { retryDelay: -1 } }, "Invalid retryDelay"],
      [{ expectedRevision: 1, secrets: { unknown: { operation: "clear" } } }, "Unknown secret"],
      [{ expectedRevision: 1, secrets: { openaiApiKey: { operation: "replace", value: "" } } }, "Replacement secret"],
      [{ expectedRevision: 1, secrets: { openaiApiKey: { operation: "clear", value: "extra" } } }, "Invalid clear"],
      [{ expectedRevision: 1, basicCredential: { operation: "invalid" } }, "Invalid basicCredential"],
      [{ expectedRevision: 1, basicCredential: { operation: "replace", username: 1, appPassword: "password" } }, "username and appPassword"],
    ] as const;

    for (const [patch, message] of invalidGlobalPatches) {
      await expect(service.updateGlobal(patch as never)).rejects.toThrow(message);
    }
    await expect(
      service.updateRepository(identity, {
        expectedRevision: 0,
        basicCredential: { operation: "clear" },
      }),
    ).rejects.toThrow("basicCredential is global-only");
    await expect(
      service.updateRepository(identity, {
        expectedRevision: 0,
        values: { model: "bad model" },
      }),
    ).rejects.toThrow("Invalid model");
    await expect(service.getSettingsDocument()).resolves.toMatchObject({
      repositories: [],
    });
    await expect(
      service.updateRepository(
        { workspaceSlug: "../escape", repositorySlug: "repo" },
        { expectedRevision: 0 },
      ),
    ).rejects.toThrow("Invalid repository identity");
  });

  it("imports mapped repository credentials exactly once", async () => {
    const { service } = createService({
      "runtimeSettings.repositoryWorkspaceMap": { shared: "workspace-a" },
      "bitbucket.repoTokens": { shared: "repository-token" },
      "bitbucket.repoWebhookSecrets": { shared: "repository-webhook" },
    });

    await service.onApplicationBootstrap();
    await service.onApplicationBootstrap();

    const identity = {
      workspaceSlug: "workspace-a",
      repositorySlug: "shared",
    };
    await expect(service.resolveJobCredentials(identity)).resolves.toMatchObject({
      bitbucket: {
        apiTokens: ["repository-token", "global-bitbucket-secret"],
      },
    });
    await expect(service.resolveWebhookSecret(identity)).resolves.toBe(
      "repository-webhook",
    );
  });

  it("rejects an oversized imported custom prompt before persistence", async () => {
    const readFileSpy = jest
      .spyOn(fsPromises, "readFile")
      .mockResolvedValue("x".repeat(100_001));
    const { service, rows } = createService({
      "codex.customPromptFilepath": "/tmp/custom-prompt.md",
    });

    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      "Invalid customPrompt",
    );
    expect(rows.size).toBe(0);
    readFileSpy.mockRestore();
  });

  it("rejects invalid encryption keys and partial imported Basic credentials", async () => {
    expect(() =>
      createService({
        "runtimeSettings.encryptionKey": "too-short",
      }),
    ).toThrow("SETTINGS_ENCRYPTION_KEY must be exactly 32 bytes");

    const { service, rows } = createService({
      "bitbucket.appPassword": "",
    });
    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      "BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD must be imported together",
    );
    expect(rows.size).toBe(0);
  });

  it("elects exactly one importer when Pods bootstrap concurrently", async () => {
    const store = createRepository();
    const first = createService(
      {
        "runtimeSettings.repositoryWorkspaceMap": { shared: "workspace-a" },
        "bitbucket.repoTokens": { shared: "repository-token" },
      },
      store,
    ).service;
    const second = createService(
      {
        "runtimeSettings.repositoryWorkspaceMap": { shared: "workspace-a" },
        "bitbucket.repoTokens": { shared: "repository-token" },
      },
      store,
    ).service;

    await expect(
      Promise.all([
        first.onApplicationBootstrap(),
        second.onApplicationBootstrap(),
      ]),
    ).resolves.toEqual([undefined, undefined]);
    expect([...store.rows.keys()].sort()).toEqual([
      "global",
      "repo:workspace-a/shared",
    ]);
  });
});
