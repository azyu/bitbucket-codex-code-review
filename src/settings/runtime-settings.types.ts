export interface IRepositoryIdentity {
  readonly workspaceSlug: string;
  readonly repositorySlug: string;
}

export interface IReviewSettingsSnapshot {
  readonly revision: string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly timeoutMs: number;
  readonly triggerMode: "mention" | "auto" | "both";
  readonly customPrompt: string;
  readonly retryAttempts: number;
  readonly retryDelay: number;
  readonly cloneTimeoutMs: number;
}

export interface IBitbucketCredentialSnapshot {
  readonly apiTokens: readonly string[];
  readonly username?: string;
  readonly appPassword?: string;
}

export interface IOpenAiConnectionSnapshot {
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

export interface IJobCredentialSnapshot {
  readonly bitbucket: IBitbucketCredentialSnapshot;
  readonly openai: IOpenAiConnectionSnapshot;
}

export type SecretMutation =
  | { readonly operation: "replace"; readonly value: string }
  | { readonly operation: "clear" };

export type BasicCredentialMutation =
  | {
      readonly operation: "replace";
      readonly username: string;
      readonly appPassword: string;
    }
  | { readonly operation: "clear" };

export interface ISettingsPatch {
  readonly expectedRevision: number;
  readonly values?: Record<string, unknown>;
  readonly secrets?: Record<string, SecretMutation>;
  readonly basicCredential?: BasicCredentialMutation;
}

export interface ISecretStatus {
  readonly configured: boolean;
  readonly source: "repository" | "global" | "unconfigured";
}

export interface ISettingsScopeDocument {
  readonly scope: "global" | "repository";
  readonly workspaceSlug: string;
  readonly repositorySlug: string;
  readonly revision: number;
  readonly values: Record<string, unknown>;
  readonly secrets: Record<string, ISecretStatus>;
  readonly basicCredentialConfigured?: boolean;
  readonly updatedAt: Date;
}

export interface ISettingsDocument {
  readonly global: ISettingsScopeDocument;
  readonly repositories: readonly ISettingsScopeDocument[];
}
