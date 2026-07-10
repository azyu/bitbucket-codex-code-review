# GPT-5.6 Compatibility Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the worker officially compatible with GPT-5.6, use `gpt-5.6-sol` by default, and reject unsupported reasoning configuration before jobs start.

**Architecture:** Preserve the existing environment-to-`CodexService` data flow. Upgrade the container's Codex CLI, move all active model defaults together, add Joi validation at the existing configuration boundary, and characterize exact model forwarding with focused Jest coverage.

**Tech Stack:** NestJS 11, TypeScript 5.9, Joi 17, Jest 29, Docker, Helm 4

## Global Constraints

- Pin `@openai/codex` to `0.144.1`; OpenAI documents `0.144.0` as the GPT-5.6 minimum.
- Set the default model to `gpt-5.6-sol` on every active runtime, deployment, test, and documentation surface.
- Continue accepting `CODEX_MODEL` as an opaque string; do not add a model allowlist.
- Accept only `none`, `low`, `medium`, `high`, `xhigh`, and `max` for `CODEX_REASONING_EFFORT`.
- Keep `medium` as the default reasoning effort.
- Do not add runtime version probes, model-catalog subprocesses, model routing, Pro mode, multi-agent mode, or prompt changes.
- Preserve queue, database, Bitbucket, workspace, and review output contracts.

---

### Task 1: Upgrade the Container Codex CLI

**Files:**
- Modify: `Dockerfile:35-36`

**Interfaces:**
- Consumes: npm package `@openai/codex@0.144.1`
- Produces: container command `codex` with GPT-5.6 support

- [ ] **Step 1: Update the pinned package version**

Change the runtime installation to:

```dockerfile
# renovate: datasource=npm depName=@openai/codex
RUN npm install -g @openai/codex@0.144.1
```

- [ ] **Step 2: Build the runtime image**

Run:

```bash
docker build -t code-review-worker:gpt-5.6-cli .
```

Expected: exit code `0`. If the Docker daemon is unavailable, record the exact daemon error and continue with the non-Docker checks; do not claim the image was verified.

- [ ] **Step 3: Verify the CLI inside the image**

Run:

```bash
docker run --rm --entrypoint codex code-review-worker:gpt-5.6-cli --version
```

Expected output:

```text
codex-cli 0.144.1
```

- [ ] **Step 4: Commit the CLI upgrade**

```bash
git add Dockerfile
git commit -m "build: upgrade codex cli to 0.144.1"
```

---

### Task 2: Move Active Defaults to GPT-5.6 Sol

**Files:**
- Modify: `src/config/configuration.spec.ts:1-61`
- Modify: `src/config/configuration.ts:14-17`
- Modify: `src/webhook/webhook.controller.spec.ts:43-46,101-104,157-163,184-189`
- Modify: `.env.example:25-29`
- Modify: `docker-compose.yml:39-42`
- Modify: `charts/code-review-worker/values.yaml:62-67`
- Modify: `README.md:105-115`
- Modify: `charts/code-review-worker/README.md:104-115`

**Interfaces:**
- Consumes: environment variable `CODEX_MODEL`
- Produces: `DEFAULTS.CODEX_MODEL === "gpt-5.6-sol"` and matching deployment defaults

- [ ] **Step 1: Write a failing default-configuration test**

Change the import and add a separate default-configuration test:

```typescript
import configuration, { parseJsonRecord } from "./configuration";

describe("configuration", () => {
  const originalCodexModel = process.env["CODEX_MODEL"];

  afterEach(() => {
    if (originalCodexModel === undefined) {
      delete process.env["CODEX_MODEL"];
    } else {
      process.env["CODEX_MODEL"] = originalCodexModel;
    }
  });

  it("defaults Codex to GPT-5.6 Sol", () => {
    delete process.env["CODEX_MODEL"];

    const config = configuration();

    expect(config).toEqual(
      expect.objectContaining({
        codex: expect.objectContaining({ model: "gpt-5.6-sol" }),
      }),
    );
  });
});
```

Keep the existing `parseJsonRecord` tests unchanged.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm test --runInBand src/config/configuration.spec.ts
```

Expected: FAIL because the actual default is `gpt-5.5`.

- [ ] **Step 3: Change the application default**

In `src/config/configuration.ts`, set:

```typescript
CODEX_MODEL: "gpt-5.6-sol",
```

- [ ] **Step 4: Update deployment and documentation defaults**

Replace active `gpt-5.5` defaults with `gpt-5.6-sol` in:

```text
.env.example
docker-compose.yml
charts/code-review-worker/values.yaml
README.md
charts/code-review-worker/README.md
```

Do not change historical entries in `.context/TASKS.md`.

- [ ] **Step 5: Update user-visible progress-message fixtures**

In `src/webhook/webhook.controller.spec.ts`, set the mock model and expected progress messages to `gpt-5.6-sol`:

```typescript
"codex.model": "gpt-5.6-sol",
```

Expected message fragments:

```text
- Model: gpt-5.6-sol
- Reasoning: high
```

and:

```text
- Model: gpt-5.6-sol
```

- [ ] **Step 6: Verify the new default and progress output**

Run:

```bash
pnpm test --runInBand src/config/configuration.spec.ts src/webhook/webhook.controller.spec.ts
```

Expected: both suites PASS.

- [ ] **Step 7: Render the default Helm ConfigMap**

Run:

```bash
helm template review-worker charts/code-review-worker --show-only templates/configmap.yaml
```

Expected rendered field:

```yaml
CODEX_MODEL: "gpt-5.6-sol"
```

- [ ] **Step 8: Commit the default migration**

```bash
git add src/config/configuration.ts src/config/configuration.spec.ts src/webhook/webhook.controller.spec.ts .env.example docker-compose.yml charts/code-review-worker/values.yaml README.md charts/code-review-worker/README.md
git commit -m "feat: default reviews to gpt-5.6-sol"
```

---

### Task 3: Validate GPT-5.6 Reasoning Effort

**Files:**
- Modify: `src/config/validation.spec.ts:3-81`
- Modify: `src/config/validation.ts:42-45`
- Modify: `README.md:109-112`

**Interfaces:**
- Consumes: `CODEX_REASONING_EFFORT` environment string
- Produces: a validated value in `none | low | medium | high | xhigh | max`, defaulting to `medium`

- [ ] **Step 1: Write the failing rejection test**

Add to `src/config/validation.spec.ts`:

```typescript
it("rejects unsupported Codex reasoning effort", () => {
  const { error } = validationSchema.validate({
    ...validEnv,
    CODEX_REASONING_EFFORT: "ultra",
  });

  expect(error?.message).toContain("CODEX_REASONING_EFFORT");
});
```

- [ ] **Step 2: Run the rejection test and verify RED**

Run:

```bash
pnpm test --runInBand src/config/validation.spec.ts
```

Expected: FAIL because the current schema allows the unknown environment key through.

- [ ] **Step 3: Add Joi validation**

In `src/config/validation.ts`, add directly after `CODEX_MODEL`:

```typescript
CODEX_REASONING_EFFORT: Joi.string()
  .valid("none", "low", "medium", "high", "xhigh", "max")
  .default(DEFAULTS.CODEX_REASONING_EFFORT),
```

- [ ] **Step 4: Add allowed-value and default coverage**

Update the existing default assertion:

```typescript
expect(value).toEqual(
  expect.objectContaining({
    PORT: 3000,
    CODEX_BINARY_PATH: "codex",
    CODEX_MODEL: "gpt-5.6-sol",
    CODEX_REASONING_EFFORT: "medium",
    BITBUCKET_REPO_TOKENS: "",
    REVIEW_TRIGGER_MODE: "mention",
  }),
);
```

Add a table-driven test:

```typescript
it.each(["none", "low", "medium", "high", "xhigh", "max"])(
  "accepts Codex reasoning effort %s",
  (reasoningEffort) => {
    const { error, value } = validationSchema.validate({
      ...validEnv,
      CODEX_REASONING_EFFORT: reasoningEffort,
    });

    expect(error).toBeUndefined();
    expect(value.CODEX_REASONING_EFFORT).toBe(reasoningEffort);
  },
);
```

- [ ] **Step 5: Document the accepted values**

Set the root README description to:

```text
추론 노력도 (`none` / `low` / `medium` / `high` / `xhigh` / `max`)
```

- [ ] **Step 6: Verify GREEN**

Run:

```bash
pnpm test --runInBand src/config/validation.spec.ts
```

Expected: PASS, including the rejection and all six accepted values.

- [ ] **Step 7: Commit reasoning validation**

```bash
git add src/config/validation.ts src/config/validation.spec.ts README.md
git commit -m "feat: validate codex reasoning effort"
```

---

### Task 4: Add GPT-5.6 Model Forwarding Regression Coverage

**Files:**
- Modify: `src/codex/codex.service.spec.ts:68-128`

**Interfaces:**
- Consumes: `codex.model` and `codex.reasoningEffort` from `ConfigService`
- Produces: exact `spawn` argv coverage for the GPT-5.6 alias and three explicit variants

- [ ] **Step 1: Add parameterized forwarding coverage**

Add inside `describe("CodexService", ...)`:

```typescript
it.each([
  "gpt-5.6",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
])("forwards GPT-5.6 model %s to Codex", async (model) => {
  const child = createMockChild();
  spawnSpy.mockReturnValue(child);
  readFileSpy.mockResolvedValue("review output text");

  const promise = createService({
    "codex.model": model,
    "codex.reasoningEffort": "medium",
  }).executeCodex("/work", "main", "review this");

  child.emit("close", 0, null);
  await promise;

  const [, args] = spawnSpy.mock.calls[0] as [string, string[]];
  const modelArgIndex = args.indexOf("--model");
  const configArgIndex = args.indexOf("-c");

  expect(modelArgIndex).toBeGreaterThan(-1);
  expect(args[modelArgIndex + 1]).toBe(model);
  expect(configArgIndex).toBeGreaterThan(-1);
  expect(args[configArgIndex + 1]).toBe(
    'model_reasoning_effort="medium"',
  );
});
```

This is characterization coverage for the existing opaque-model forwarding contract; it is expected to pass immediately and requires no production-code change.

- [ ] **Step 2: Run the focused Codex tests**

Run:

```bash
pnpm test --runInBand src/codex/codex.service.spec.ts
```

Expected: PASS for all existing tests plus four model cases.

- [ ] **Step 3: Render each explicit Helm override**

Run:

```bash
helm template review-worker charts/code-review-worker --set codex.model=gpt-5.6-sol --show-only templates/configmap.yaml
helm template review-worker charts/code-review-worker --set codex.model=gpt-5.6-terra --show-only templates/configmap.yaml
helm template review-worker charts/code-review-worker --set codex.model=gpt-5.6-luna --show-only templates/configmap.yaml
```

Expected: each output contains the exact selected `CODEX_MODEL` value and `CODEX_REASONING_EFFORT: "medium"`.

- [ ] **Step 4: Commit forwarding coverage**

```bash
git add src/codex/codex.service.spec.ts
git commit -m "test: cover gpt-5.6 model forwarding"
```
