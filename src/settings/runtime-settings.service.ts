import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { In, Repository } from "typeorm";
import { DEFAULTS } from "../config/configuration";
import { RuntimeSettingEntity } from "../entities/runtime-setting.entity";
import { ServiceLogger } from "@lib/logger";
import {
  type BasicCredentialMutation,
  type IBitbucketCredentialSnapshot,
  type IJobCredentialSnapshot,
  type IOpenAiConnectionSnapshot,
  type IRepositoryIdentity,
  type IReviewSettingsSnapshot,
  type ISecretStatus,
  type ISettingsDocument,
  type ISettingsPatch,
  type ISettingsScopeDocument,
  type SecretMutation,
} from "./runtime-settings.types";

const GLOBAL_KEY = "global";
const GLOBAL_VALUE_KEYS: Record<string, true> = {
  model: true,
  reasoningEffort: true,
  timeoutMs: true,
  customPrompt: true,
  openaiBaseUrl: true,
  triggerMode: true,
  retryAttempts: true,
  retryDelay: true,
  workerConcurrency: true,
  cloneTimeoutMs: true,
};
const REPOSITORY_VALUE_KEYS: Record<string, true> = {
  model: true,
  reasoningEffort: true,
  timeoutMs: true,
  customPrompt: true,
};
const GLOBAL_SECRET_KEYS: Record<string, true> = {
  openaiApiKey: true,
  bitbucketApiToken: true,
  webhookSecret: true,
};
const REPOSITORY_SECRET_KEYS: Record<string, true> = {
  bitbucketApiToken: true,
  webhookSecret: true,
};
const REASONING_VALUES: Record<string, true> = {
  "": true,
  none: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
};
const TRIGGER_VALUES: Record<string, true> = {
  mention: true,
  auto: true,
  both: true,
};
const MAX_TIMER_MS = 2_147_483_647;

type SecretValues = {
  openaiApiKey?: string;
  bitbucketApiToken?: string;
  webhookSecret?: string;
  username?: string;
  appPassword?: string;
};

type Envelope = {
  readonly v: 1;
  readonly iv: string;
  readonly tag: string;
  readonly ciphertext: string;
};

@Injectable()
export class RuntimeSettingsService implements OnApplicationBootstrap {
  private readonly logger = new ServiceLogger(RuntimeSettingsService.name);
  private readonly encryptionKey: Buffer;

  constructor(
    @InjectRepository(RuntimeSettingEntity)
    private readonly repository: Repository<RuntimeSettingEntity>,
    private readonly configService: ConfigService,
  ) {
    const rawKey = this.configService.getOrThrow<string>(
      "runtimeSettings.encryptionKey",
    );
    this.encryptionKey = Buffer.from(rawKey, "utf8");
    if (this.encryptionKey.length !== 32) {
      throw new Error("SETTINGS_ENCRYPTION_KEY must be exactly 32 bytes");
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.importEnvironmentOnce();
  }

  async resolveReviewSettings(
    identity: IRepositoryIdentity,
    modelOverride?: string,
  ): Promise<IReviewSettingsSnapshot> {
    const [global, scoped] = await this.loadPair(identity);
    const values = { ...global.values, ...(scoped?.values ?? {}) };
    return Object.freeze({
      revision: `${global.revision}:${scoped?.revision ?? 0}`,
      model: modelOverride ?? this.stringValue(values, "model"),
      reasoningEffort: this.stringValue(values, "reasoningEffort"),
      timeoutMs: this.numberValue(values, "timeoutMs"),
      triggerMode: this.stringValue(values, "triggerMode") as
        | "mention"
        | "auto"
        | "both",
      customPrompt: this.stringValue(values, "customPrompt"),
      retryAttempts: this.numberValue(values, "retryAttempts"),
      retryDelay: this.numberValue(values, "retryDelay"),
      cloneTimeoutMs: this.numberValue(values, "cloneTimeoutMs"),
    });
  }

  async resolveWebhookSecret(identity: IRepositoryIdentity): Promise<string> {
    const [global, scoped] = await this.loadPair(identity);
    const globalSecrets = this.decrypt(global);
    const scopedSecrets = scoped ? this.decrypt(scoped) : {};
    return scopedSecrets.webhookSecret ?? globalSecrets.webhookSecret ?? "";
  }

  async resolveJobCredentials(
    identity: IRepositoryIdentity,
  ): Promise<IJobCredentialSnapshot> {
    const [global, scoped] = await this.loadPair(identity);
    const globalSecrets = this.decrypt(global);
    const scopedSecrets = scoped ? this.decrypt(scoped) : {};
    const apiTokens = [
      scopedSecrets.bitbucketApiToken,
      globalSecrets.bitbucketApiToken,
    ].filter(
      (token, index, tokens): token is string =>
        Boolean(token) && tokens.indexOf(token) === index,
    );
    const bitbucket: IBitbucketCredentialSnapshot = Object.freeze({
      apiTokens,
      username: globalSecrets.username,
      appPassword: globalSecrets.appPassword,
    });
    const baseUrl = this.optionalString(global.values, "openaiBaseUrl");
    const openai: IOpenAiConnectionSnapshot = Object.freeze({
      apiKey: globalSecrets.openaiApiKey,
      baseUrl,
    });
    return Object.freeze({ bitbucket, openai });
  }

  async getWorkerSettings(): Promise<{
    readonly revision: number;
    readonly concurrency: number;
  }> {
    const global = await this.requireGlobal();
    return {
      revision: global.revision,
      concurrency: this.numberValue(global.values, "workerConcurrency"),
    };
  }

  async getSettingsDocument(): Promise<ISettingsDocument> {
    const rows = await this.repository.find({ order: { scopeKey: "ASC" } });
    const global = rows.find((row) => row.scopeKey === GLOBAL_KEY);
    if (!global) throw new Error("Global runtime settings are not initialized");
    const globalSecrets = this.decrypt(global);
    return {
      global: this.toDocument(global, globalSecrets),
      repositories: rows
        .filter((row) => row.scope === "repository")
        .map((row) => this.toDocument(row, globalSecrets)),
    };
  }

  async updateGlobal(patch: ISettingsPatch): Promise<ISettingsScopeDocument> {
    return this.updateScope(await this.requireGlobal(), patch, true);
  }

  async updateRepository(
    identity: IRepositoryIdentity,
    patch: ISettingsPatch,
  ): Promise<ISettingsScopeDocument> {
    this.validateIdentity(identity);
    const key = this.repositoryKey(identity);
    let row = await this.repository.findOneBy({ scopeKey: key });
    if (!row) {
      if (patch.expectedRevision !== 0) {
        throw await this.conflict(key);
      }
      row = this.repository.create({
        scopeKey: key,
        scope: "repository",
        workspaceSlug: identity.workspaceSlug,
        repositorySlug: identity.repositorySlug,
        values: {},
        encryptedSecrets: this.encrypt(key, {}),
        revision: 0,
      });
      try {
        await this.repository.insert(row);
      } catch {
        throw await this.conflict(key);
      }
    }
    return this.updateScope(row, patch, false);
  }

  private async updateScope(
    row: RuntimeSettingEntity,
    patch: ISettingsPatch,
    global: boolean,
  ): Promise<ISettingsScopeDocument> {
    this.validatePatch(patch, global);
    if (row.revision !== patch.expectedRevision) {
      throw await this.conflict(row.scopeKey);
    }
    const values: Record<string, string | number> = { ...row.values };
    for (const [key, value] of Object.entries(patch.values ?? {})) {
      if (!global && value === null) delete values[key];
      else values[key] = value as string | number;
    }
    const secrets = this.decrypt(row);
    for (const [key, mutation] of Object.entries(patch.secrets ?? {})) {
      this.applySecretMutation(secrets, key, mutation);
    }
    if (patch.basicCredential) {
      this.applyBasicCredentialMutation(secrets, patch.basicCredential);
    }
    const result = await this.repository.update(
      { scopeKey: row.scopeKey, revision: patch.expectedRevision },
      {
        values,
        encryptedSecrets: this.encrypt(row.scopeKey, secrets),
        revision: () => "revision + 1",
      },
    );
    if (result.affected !== 1) throw await this.conflict(row.scopeKey);
    const updated = await this.repository.findOneByOrFail({
      scopeKey: row.scopeKey,
    });
    const globalSecrets = global
      ? this.decrypt(updated)
      : this.decrypt(await this.requireGlobal());
    this.logger.log(
      `Runtime settings updated: scope=${row.scopeKey}, revision=${updated.revision}, keys=${[
        ...Object.keys(patch.values ?? {}),
        ...Object.keys(patch.secrets ?? {}),
        ...(patch.basicCredential ? ["basicCredential"] : []),
      ].join(",")}`,
    );
    return this.toDocument(updated, globalSecrets);
  }

  private validatePatch(patch: ISettingsPatch, global: boolean): void {
    if (
      !patch ||
      !Number.isInteger(patch.expectedRevision) ||
      patch.expectedRevision < 0
    ) {
      throw new BadRequestException(
        "expectedRevision must be a non-negative integer",
      );
    }
    const allowedTopLevel: Record<string, true> = {
      expectedRevision: true,
      values: true,
      secrets: true,
      basicCredential: true,
    };
    for (const key of Object.keys(patch as object)) {
      if (!allowedTopLevel[key]) {
        throw new BadRequestException(`Unknown field: ${key}`);
      }
    }
    const allowedValues = global ? GLOBAL_VALUE_KEYS : REPOSITORY_VALUE_KEYS;
    for (const [key, value] of Object.entries(patch.values ?? {})) {
      if (!allowedValues[key]) {
        throw new BadRequestException(`Unknown setting: ${key}`);
      }
      if (!global && value === null) continue;
      this.validateValue(key, value);
    }
    const allowedSecrets = global ? GLOBAL_SECRET_KEYS : REPOSITORY_SECRET_KEYS;
    for (const [key, mutation] of Object.entries(patch.secrets ?? {})) {
      if (!allowedSecrets[key]) {
        throw new BadRequestException(`Unknown secret: ${key}`);
      }
      this.validateSecretMutation(mutation);
    }
    if (!global && patch.basicCredential !== undefined) {
      throw new BadRequestException("basicCredential is global-only");
    }
    if (patch.basicCredential) {
      this.validateBasicCredential(patch.basicCredential);
    }
  }

  private validateValue(key: string, value: unknown): void {
    if (key === "model" || key === "customPrompt") {
      if (
        typeof value !== "string" ||
        (key === "model" && !/^[A-Za-z0-9][\w.-]*$/.test(value))
      ) {
        throw new BadRequestException(`Invalid ${key}`);
      }
      return;
    }
    if (key === "reasoningEffort") {
      if (typeof value !== "string" || !REASONING_VALUES[value]) {
        throw new BadRequestException("Invalid reasoningEffort");
      }
      return;
    }
    if (key === "triggerMode") {
      if (typeof value !== "string" || !TRIGGER_VALUES[value]) {
        throw new BadRequestException("Invalid triggerMode");
      }
      return;
    }
    if (key === "openaiBaseUrl") {
      if (typeof value !== "string") {
        throw new BadRequestException("Invalid openaiBaseUrl");
      }
      if (value !== "") {
        try {
          if (new URL(value).protocol !== "https:") throw new Error();
        } catch {
          throw new BadRequestException("openaiBaseUrl must be an HTTPS URL");
        }
      }
      return;
    }
    if (
      !Number.isInteger(value) ||
      (value as number) < (key === "retryDelay" ? 0 : 1) ||
      (value as number) > MAX_TIMER_MS
    ) {
      throw new BadRequestException(`Invalid ${key}`);
    }
  }

  private validateSecretMutation(mutation: SecretMutation): void {
    if (!mutation || !["replace", "clear"].includes(mutation.operation)) {
      throw new BadRequestException("Invalid secret operation");
    }
    const keys = Object.keys(mutation);
    if (mutation.operation === "replace") {
      if (keys.some((key) => !["operation", "value"].includes(key)) || typeof mutation.value !== "string" || mutation.value.length === 0) {
        throw new BadRequestException("Replacement secret must be non-empty");
      }
    } else if (keys.some((key) => key !== "operation")) {
      throw new BadRequestException("Invalid clear operation");
    }
  }

  private validateBasicCredential(mutation: BasicCredentialMutation): void {
    const keys = Object.keys(mutation);
    if (mutation.operation === "replace") {
      if (keys.some((key) => !["operation", "username", "appPassword"].includes(key)) || !mutation.username || !mutation.appPassword) {
        throw new BadRequestException("username and appPassword must be replaced together");
      }
    } else if (mutation.operation !== "clear" || keys.some((key) => key !== "operation")) {
      throw new BadRequestException("Invalid basicCredential operation");
    }
  }

  private applySecretMutation(
    secrets: SecretValues,
    key: string,
    mutation: SecretMutation,
  ): void {
    if (mutation.operation === "clear") delete secrets[key as keyof SecretValues];
    else secrets[key as keyof SecretValues] = mutation.value;
  }

  private applyBasicCredentialMutation(
    secrets: SecretValues,
    mutation: BasicCredentialMutation,
  ): void {
    if (mutation.operation === "clear") {
      delete secrets.username;
      delete secrets.appPassword;
    } else {
      secrets.username = mutation.username;
      secrets.appPassword = mutation.appPassword;
    }
  }

  private async loadPair(
    identity: IRepositoryIdentity,
  ): Promise<[RuntimeSettingEntity, RuntimeSettingEntity | undefined]> {
    this.validateIdentity(identity);
    const repositoryKey = this.repositoryKey(identity);
    const rows = await this.repository.findBy({
      scopeKey: In([GLOBAL_KEY, repositoryKey]),
    });
    const global = rows.find((row) => row.scopeKey === GLOBAL_KEY);
    if (!global) throw new Error("Global runtime settings are not initialized");
    return [global, rows.find((row) => row.scopeKey === repositoryKey)];
  }

  private async requireGlobal(): Promise<RuntimeSettingEntity> {
    const global = await this.repository.findOneBy({ scopeKey: GLOBAL_KEY });
    if (!global) throw new Error("Global runtime settings are not initialized");
    return global;
  }

  private repositoryKey(identity: IRepositoryIdentity): string {
    return `repo:${identity.workspaceSlug}/${identity.repositorySlug}`;
  }

  private validateIdentity(identity: IRepositoryIdentity): void {
    const valid = /^[A-Za-z0-9._-]+$/;
    if (!valid.test(identity.workspaceSlug) || !valid.test(identity.repositorySlug)) {
      throw new BadRequestException("Invalid repository identity");
    }
  }

  private encrypt(scopeKey: string, secrets: SecretValues): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    cipher.setAAD(Buffer.from(scopeKey));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(secrets), "utf8"),
      cipher.final(),
    ]);
    const envelope: Envelope = {
      v: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    return JSON.stringify(envelope);
  }

  private decrypt(row: RuntimeSettingEntity): SecretValues {
    const envelope = JSON.parse(row.encryptedSecrets) as Envelope;
    if (envelope.v !== 1) {
      throw new Error("Unsupported settings secret envelope");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      Buffer.from(envelope.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(row.scopeKey));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as SecretValues;
  }

  private toDocument(
    row: RuntimeSettingEntity,
    globalSecrets: SecretValues,
  ): ISettingsScopeDocument {
    const secrets = this.decrypt(row);
    const keys =
      row.scope === "global"
        ? Object.keys(GLOBAL_SECRET_KEYS)
        : Object.keys(REPOSITORY_SECRET_KEYS);
    const statuses: Record<string, ISecretStatus> = {};
    for (const key of keys) {
      const local = Boolean(secrets[key as keyof SecretValues]);
      const inherited = row.scope === "repository" && Boolean(globalSecrets[key as keyof SecretValues]);
      statuses[key] = {
        configured: local || inherited,
        source: local ? row.scope : inherited ? "global" : "unconfigured",
      };
    }
    return {
      scope: row.scope,
      workspaceSlug: row.workspaceSlug,
      repositorySlug: row.repositorySlug,
      revision: row.revision,
      values: { ...row.values },
      secrets: statuses,
      ...(row.scope === "global"
        ? {
            basicCredentialConfigured: Boolean(
              secrets.username && secrets.appPassword,
            ),
          }
        : {}),
      updatedAt: row.updatedAt,
    };
  }

  private async conflict(scopeKey: string): Promise<ConflictException> {
    const row = await this.repository.findOneBy({ scopeKey });
    const global = await this.requireGlobal();
    return new ConflictException({
      statusCode: 409,
      message: "Runtime settings revision conflict",
      current: row ? this.toDocument(row, this.decrypt(global)) : null,
    });
  }

  private stringValue(
    values: Record<string, string | number>,
    key: string,
  ): string {
    const value = values[key];
    if (typeof value !== "string") {
      throw new Error(`Invalid stored setting: ${key}`);
    }
    return value;
  }

  private optionalString(
    values: Record<string, string | number>,
    key: string,
  ): string | undefined {
    const value = values[key];
    return typeof value === "string" && value !== "" ? value : undefined;
  }

  private numberValue(
    values: Record<string, string | number>,
    key: string,
  ): number {
    const value = values[key];
    if (typeof value !== "number") {
      throw new Error(`Invalid stored setting: ${key}`);
    }
    return value;
  }

  private async importEnvironmentOnce(): Promise<void> {
    if (await this.repository.exist({ where: { scopeKey: GLOBAL_KEY } })) return;

    const repoTokens = this.configService.get<Record<string, string>>(
      "bitbucket.repoTokens",
      {},
    );
    const repoWebhookSecrets = this.configService.get<Record<string, string>>(
      "bitbucket.repoWebhookSecrets",
      {},
    );
    const repoPromptPaths = this.configService.get<Record<string, string>>(
      "codex.repoCustomPromptFilepaths",
      {},
    );
    const workspaceMap = this.configService.get<Record<string, string>>(
      "runtimeSettings.repositoryWorkspaceMap",
      {},
    );
    const repositorySlugs = new Set([
      ...Object.keys(repoTokens),
      ...Object.keys(repoWebhookSecrets),
      ...Object.keys(repoPromptPaths),
    ]);
    const missingMappings = [...repositorySlugs].filter(
      (slug) => !workspaceMap[slug],
    );
    if (missingMappings.length > 0) {
      throw new Error(
        `RUNTIME_SETTINGS_REPOSITORY_WORKSPACE_MAP is missing: ${missingMappings.join(", ")}`,
      );
    }

    const globalPromptPath = this.configService.get<string>(
      "codex.customPromptFilepath",
      "",
    );
    const globalPrompt = globalPromptPath
      ? await readFile(globalPromptPath, "utf8")
      : "";
    const globalSecrets: SecretValues = {};
    const username = this.configService.get<string>("bitbucket.username", "");
    const appPassword = this.configService.get<string>(
      "bitbucket.appPassword",
      "",
    );
    if (Boolean(username) !== Boolean(appPassword)) {
      throw new Error(
        "BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD must be imported together",
      );
    }
    const secretImports: Array<[keyof SecretValues, string]> = [
      ["openaiApiKey", this.configService.get<string>("openai.apiKey", "")],
      [
        "bitbucketApiToken",
        this.configService.get<string>("bitbucket.apiToken", ""),
      ],
      [
        "webhookSecret",
        this.configService.get<string>("bitbucket.webhookSecret", ""),
      ],
      ["username", username],
      ["appPassword", appPassword],
    ];
    for (const [key, value] of secretImports) {
      if (value) globalSecrets[key] = value;
    }

    const imported = await this.repository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(RuntimeSettingEntity);
      const globalInsert = await repo
        .createQueryBuilder()
        .insert()
        .values({
        scopeKey: GLOBAL_KEY,
        scope: "global",
        workspaceSlug: "",
        repositorySlug: "",
        values: {
          model: this.configService.get("codex.model", DEFAULTS.CODEX_MODEL),
          reasoningEffort: this.configService.get("codex.reasoningEffort", DEFAULTS.CODEX_REASONING_EFFORT),
          timeoutMs: this.configService.get("codex.timeoutMs", DEFAULTS.CODEX_TIMEOUT_MS),
          customPrompt: globalPrompt,
          openaiBaseUrl: this.configService.get("openai.baseUrl", ""),
          triggerMode: this.configService.get("trigger.mode", DEFAULTS.TRIGGER_MODE),
          retryAttempts: this.configService.get("queue.retryAttempts", DEFAULTS.QUEUE_RETRY_ATTEMPTS),
          retryDelay: this.configService.get("queue.retryDelay", DEFAULTS.QUEUE_RETRY_DELAY),
          workerConcurrency: this.configService.get("workspace.maxConcurrent", DEFAULTS.WORKSPACE_MAX_CONCURRENT),
          cloneTimeoutMs: this.configService.get("workspace.cloneTimeoutMs", DEFAULTS.GIT_CLONE_TIMEOUT_MS),
        },
        encryptedSecrets: this.encrypt(GLOBAL_KEY, globalSecrets),
          revision: 1,
        })
        .orIgnore()
        .execute();
      if (globalInsert.raw.affectedRows !== 1) return false;
      for (const repositorySlug of repositorySlugs) {
        const identity = {
          workspaceSlug: workspaceMap[repositorySlug]!,
          repositorySlug,
        };
        this.validateIdentity(identity);
        const scopeKey = this.repositoryKey(identity);
        const values: Record<string, string | number> = {};
        const promptPath = repoPromptPaths[repositorySlug];
        if (promptPath) {
          values.customPrompt = await readFile(promptPath, "utf8");
        }
        const secrets: SecretValues = {};
        if (repoTokens[repositorySlug]) secrets.bitbucketApiToken = repoTokens[repositorySlug];
        if (repoWebhookSecrets[repositorySlug]) secrets.webhookSecret = repoWebhookSecrets[repositorySlug];
        await repo.insert({
          scopeKey,
          scope: "repository",
          workspaceSlug: identity.workspaceSlug,
          repositorySlug,
          values,
          encryptedSecrets: this.encrypt(scopeKey, secrets),
          revision: 1,
        });
      }
      return true;
    });
    if (imported) {
      this.logger.log("Imported bootstrap runtime settings into MySQL");
    }
  }
}
