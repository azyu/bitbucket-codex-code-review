# GPT-5.6 Compatibility Migration Design

## Goal

Make the worker officially compatible with the GPT-5.6 model family while preserving the existing review pipeline and its default `medium` reasoning behavior.

The default review model will change from `gpt-5.5` to `gpt-5.6-sol`. Operators may override it with `gpt-5.6`, `gpt-5.6-sol`, `gpt-5.6-terra`, or `gpt-5.6-luna` through the existing `CODEX_MODEL` setting.

## Scope

1. Pin the container runtime to `@openai/codex@0.144.1`, which is above OpenAI's documented GPT-5.6 minimum of `0.144.0`.
2. Change every active default and deployment example from `gpt-5.5` to `gpt-5.6-sol`.
3. Validate `CODEX_REASONING_EFFORT` at application startup.
4. Add regression coverage for GPT-5.6 model forwarding and reasoning validation.
5. Verify the rendered Helm configuration and the existing review pipeline.

## Non-Goals

- No startup call to `codex --version`.
- No startup call to `codex debug models`.
- No account-specific model availability check.
- No dynamic model router or per-repository model selection.
- No Pro mode, persisted reasoning, multi-agent, or prompt changes.
- No change to queue, database, Bitbucket, workspace, or review output contracts.

## Design

### Codex Runtime

`Dockerfile` remains the single source of truth for the container's Codex CLI version. The pinned package changes from `0.124.0` to `0.144.1`. Non-container deployments continue to own the `codex` binary selected by `CODEX_BINARY_PATH`; the application will not add a runtime version probe.

### Model Defaults

The following active defaults move together to `gpt-5.6-sol`:

- `DEFAULTS.CODEX_MODEL`
- `.env.example`
- `docker-compose.yml`
- Helm `values.yaml`
- root README
- chart README
- tests that assert user-visible progress messages

The application will continue treating `CODEX_MODEL` as an opaque string and passing it as one `spawn` argument after `--model`. This preserves support for future model IDs without introducing a repository-side model allowlist.

### Reasoning Validation

`CODEX_REASONING_EFFORT` will be added to the Joi environment schema with these GPT-5.6 values:

- `none`
- `low`
- `medium`
- `high`
- `xhigh`
- `max`

The default remains `medium`. An unsupported or malformed value will fail application configuration validation before any review job starts. Model-specific availability remains Codex/OpenAI's responsibility.

### Execution Flow

The runtime flow remains unchanged:

```text
CODEX_MODEL + CODEX_REASONING_EFFORT
  -> Nest configuration
  -> CodexService
  -> codex exec --model <model> -c model_reasoning_effort="<effort>"
```

No additional subprocess or network request is introduced.

## Error Handling

- Invalid `CODEX_REASONING_EFFORT`: application startup fails through the existing Joi validation path.
- Unavailable model for the authenticated account: the existing non-zero Codex exit handling records stderr and fails the review job.
- Missing or incompatible non-container Codex binary: existing spawn error handling remains authoritative.

## Testing

### Focused Tests

- Parameterized `CodexService` test for `gpt-5.6`, `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`, asserting exact `--model` argv forwarding.
- Validation tests that accept all six documented reasoning values.
- Validation test that rejects an unsupported reasoning value.
- Existing progress-message tests updated to the new default model.

### Deployment Checks

- Render the Helm ConfigMap for Sol, Terra, and Luna overrides.
- Build the Docker image and verify `codex --version` reports at least `0.144.0` when the local Docker daemon is available.

### Definition of Done

- `pnpm build`
- `pnpm lint`
- `pnpm test --runInBand`
- `pnpm test:cov --runInBand` with statement coverage at least 80%
- No hardcoded secret, external-input expansion, or additional error leakage
- `.context/TASKS.md` updated
- Conventional commit created

## Rollback

Revert the default model surfaces to `gpt-5.5` and the Docker CLI pin to `0.124.0`. No data migration or compatibility shim is required because model and reasoning settings are environment-driven strings.
