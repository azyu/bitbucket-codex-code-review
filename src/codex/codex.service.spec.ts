import { EventEmitter } from "events";
import { ConfigService } from "@nestjs/config";
import { CodexService } from "./codex.service";
import * as childProcess from "child_process";
import * as fsPromises from "fs/promises";

jest.mock("@lib/logger", () => ({
  ServiceLogger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  })),
}));

interface MockChildProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: {
    end: jest.Mock;
  };
}

function createMockStream(): EventEmitter & { setEncoding: jest.Mock } {
  const stream = new EventEmitter() as EventEmitter & { setEncoding: jest.Mock };
  stream.setEncoding = jest.fn();
  return stream;
}

function createMockChild(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = createMockStream();
  child.stderr = createMockStream();
  child.stdin = { end: jest.fn() };
  return child;
}

function makeTurnCompleted(
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
): string {
  return JSON.stringify({
    type: "turn.completed",
    usage: { input_tokens: inputTokens, cached_input_tokens: cachedInputTokens, output_tokens: outputTokens },
  });
}

function createService(overrides?: Partial<Record<string, unknown>>): CodexService {
  const defaults: Record<string, unknown> = {
    "codex.binaryPath": "/usr/bin/codex",
    "codex.timeoutMs": 30000,
    "codex.model": "o3",
    "codex.reasoningEffort": "",
    ...overrides,
  };

  const configService = {
    getOrThrow: jest.fn((key: string) => {
      if (!(key in defaults)) throw new Error(`Missing ${key}`);
      return defaults[key];
    }),
    get: jest.fn((key: string, fallback: unknown) => defaults[key] ?? fallback),
  } as unknown as ConfigService;

  return new CodexService(configService);
}

describe("CodexService", () => {
  let spawnSpy: jest.SpyInstance;
  let readFileSpy: jest.SpyInstance;
  let rmSpy: jest.SpyInstance;

  beforeEach(() => {
    spawnSpy = jest.spyOn(childProcess, "spawn");
    readFileSpy = jest.spyOn(fsPromises, "readFile");
    rmSpy = jest.spyOn(fsPromises, "rm").mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should extract usage and read output file on success", async () => {
    const child = createMockChild();
    spawnSpy.mockReturnValue(child);
    readFileSpy.mockResolvedValue("review output text");

    const promise = createService().executeCodex("/work", "main", "review this");

    child.stdout.emit("data", makeTurnCompleted(1200, 300, 80) + "\n");
    child.emit("close", 0, null);

    const result = await promise;

    expect(result).toEqual({
      rawOutput: "review output text",
      exitCode: 0,
      durationMs: expect.any(Number),
      inputTokens: 1200,
      cachedInputTokens: 300,
      outputTokens: 80,
    });
    expect(rmSpy).toHaveBeenCalled();
  });

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

  it("should pass prompt through stdin instead of argv to avoid E2BIG", async () => {
    const child = createMockChild();
    spawnSpy.mockReturnValue(child);
    readFileSpy.mockResolvedValue("review output text");
    const largePrompt = "review\n" + "x".repeat(300_000);

    const promise = createService().executeCodex("/work", "main", largePrompt);

    child.emit("close", 0, null);

    await promise;

    const [, args, options] = spawnSpy.mock.calls[0] as [
      string,
      string[],
      { stdio: string[] },
    ];
    expect(args).toContain("-");
    expect(args).not.toContain(largePrompt);
    expect(options.stdio[0]).toBe("pipe");
    expect(child.stdin.end).toHaveBeenCalledWith(largePrompt);
  });

  it("should only pass allowlisted env to codex child process", async () => {
    const child = createMockChild();
    spawnSpy.mockReturnValue(child);
    readFileSpy.mockResolvedValue("review output text");
    process.env["BITBUCKET_API_TOKEN"] = "bitbucket-secret";
    process.env["DB_PASSWORD"] = "database-secret";
    process.env["OPENAI_API_KEY"] = "codex-credential";

    try {
      const promise = createService().executeCodex("/work", "main", "review");

      child.emit("close", 0, null);

      await promise;

      const [, , options] = spawnSpy.mock.calls[0] as [
        string,
        string[],
        { env: NodeJS.ProcessEnv },
      ];
      expect(options.env["BITBUCKET_API_TOKEN"]).toBeUndefined();
      expect(options.env["DB_PASSWORD"]).toBeUndefined();
      expect(options.env["OPENAI_API_KEY"]).toBe("codex-credential");
    } finally {
      delete process.env["BITBUCKET_API_TOKEN"];
      delete process.env["DB_PASSWORD"];
      delete process.env["OPENAI_API_KEY"];
    }
  });

  it("should handle large JSONL streams without crashing", async () => {
    const child = createMockChild();
    spawnSpy.mockReturnValue(child);
    readFileSpy.mockResolvedValue("output");

    const promise = createService().executeCodex("/work", "main", "review");

    // Emit many non-usage lines (simulating large output)
    for (let i = 0; i < 100; i++) {
      child.stdout.emit("data", JSON.stringify({ type: "item.completed", index: i }) + "\n");
    }
    child.stdout.emit("data", makeTurnCompleted(500, 50, 30) + "\n");
    child.emit("close", 0, null);

    const result = await promise;

    expect(result.inputTokens).toBe(500);
    expect(result.outputTokens).toBe(30);
  });

  it("should handle turn.completed split across chunks", async () => {
    const child = createMockChild();
    spawnSpy.mockReturnValue(child);
    readFileSpy.mockResolvedValue("output");

    const promise = createService().executeCodex("/work", "main", "review");

    const fullLine = makeTurnCompleted(800, 200, 60);
    const splitAt = Math.floor(fullLine.length / 2);

    child.stdout.emit("data", fullLine.slice(0, splitAt));
    child.stdout.emit("data", fullLine.slice(splitAt) + "\n");
    child.emit("close", 0, null);

    const result = await promise;

    expect(result.inputTokens).toBe(800);
    expect(result.cachedInputTokens).toBe(200);
    expect(result.outputTokens).toBe(60);
  });

  it("should flush partial line without trailing newline on close", async () => {
    const child = createMockChild();
    spawnSpy.mockReturnValue(child);
    readFileSpy.mockResolvedValue("output");

    const promise = createService().executeCodex("/work", "main", "review");

    // No trailing newline
    child.stdout.emit("data", makeTurnCompleted(400, 100, 20));
    child.emit("close", 0, null);

    const result = await promise;

    expect(result.inputTokens).toBe(400);
    expect(result.outputTokens).toBe(20);
  });

  it("should map signal to exit code 124 on timeout", async () => {
    const child = createMockChild();
    spawnSpy.mockReturnValue(child);
    readFileSpy.mockRejectedValue(new Error("ENOENT"));

    const promise = createService({ "codex.timeoutMs": 50 }).executeCodex(
      "/work",
      "main",
      "review",
    );

    child.emit("close", null, "SIGTERM");

    const result = await promise;

    expect(result.exitCode).toBe(124);
    expect(result.rawOutput).toContain("exit 124");
  });

  it("should return sanitized output on non-zero exit", async () => {
    const child = createMockChild();
    spawnSpy.mockReturnValue(child);
    readFileSpy.mockRejectedValue(new Error("ENOENT"));

    const promise = createService().executeCodex("/work", "main", "review");

    child.stdout.emit("data", makeTurnCompleted(300, 0, 15) + "\n");
    child.stderr.emit("data", "model rate limited");
    child.emit("close", 2, null);

    const result = await promise;

    expect(result.exitCode).toBe(2);
    expect(result.rawOutput).toContain("model rate limited");
    expect(result.inputTokens).toBe(300);
  });

  it.each([
    { type: "error", message: "Selected model is at capacity. Please try a different model." },
    {
      type: "turn.failed",
      error: { message: "Selected model is at capacity. Please try a different model." },
    },
  ])("should return the Codex JSON error message from $type", async (event) => {
    const child = createMockChild();
    spawnSpy.mockReturnValue(child);
    readFileSpy.mockRejectedValue(new Error("ENOENT"));

    const promise = createService().executeCodex("/work", "main", "review");

    child.stdout.emit("data", `${JSON.stringify(event)}\n`);
    child.emit("close", 1, null);

    const result = await promise;

    expect(result.rawOutput).toBe(
      "Codex run failed (exit 1): Selected model is at capacity. Please try a different model.",
    );
  });

  it("should not publish unrecognized structured error messages", async () => {
    const child = createMockChild();
    spawnSpy.mockReturnValue(child);
    readFileSpy.mockRejectedValue(new Error("ENOENT"));

    const promise = createService().executeCodex("/work", "main", "review");

    child.stdout.emit(
      "data",
      `${JSON.stringify({ type: "error", message: "Request failed with api_key=secret" })}\n`,
    );
    child.emit("close", 1, null);

    const result = await promise;

    expect(result.rawOutput).toBe(
      "Codex run failed (exit 1). Check worker logs for details.",
    );
  });

  it("should throw when output file unreadable on success exit", async () => {
    const child = createMockChild();
    spawnSpy.mockReturnValue(child);
    readFileSpy.mockRejectedValue(new Error("ENOENT"));

    const promise = createService().executeCodex("/work", "main", "review");

    child.emit("close", 0, null);

    await expect(promise).rejects.toThrow("Codex output file could not be read");
  });

  it("should keep last turn.completed when multiple exist", async () => {
    const child = createMockChild();
    spawnSpy.mockReturnValue(child);
    readFileSpy.mockResolvedValue("output");

    const promise = createService().executeCodex("/work", "main", "review");

    child.stdout.emit("data", makeTurnCompleted(100, 10, 5) + "\n");
    child.stdout.emit("data", makeTurnCompleted(999, 88, 77) + "\n");
    child.emit("close", 0, null);

    const result = await promise;

    expect(result.inputTokens).toBe(999);
    expect(result.outputTokens).toBe(77);
  });

  it("should not leak prompt in rawOutput on failure", async () => {
    const child = createMockChild();
    spawnSpy.mockReturnValue(child);
    readFileSpy.mockRejectedValue(new Error("ENOENT"));

    const secretPrompt = "Review this code with SECRET_KEY=abc123";
    const promise = createService().executeCodex("/work", "main", secretPrompt);

    child.stderr.emit("data", "process exited");
    child.emit("close", 1, null);

    const result = await promise;

    expect(result.rawOutput).not.toContain(secretPrompt);
    expect(result.rawOutput).not.toContain("SECRET_KEY");
  });

  it("should return exit 124 when error(AbortError) fires before close", async () => {
    const child = createMockChild();
    spawnSpy.mockReturnValue(child);
    readFileSpy.mockRejectedValue(new Error("ENOENT"));

    const promise = createService().executeCodex("/work", "main", "review");

    // Real Node 24 ordering: error(AbortError) fires BEFORE close(null, 'SIGTERM')
    child.emit("error", new Error("The operation was aborted"));
    child.emit("close", null, "SIGTERM");

    const result = await promise;

    expect(result.exitCode).toBe(124);
    expect(result.rawOutput).toContain("exit 124");
  });

  it("should preserve spawn ENOENT error message when stderr is empty", async () => {
    const child = createMockChild();
    spawnSpy.mockReturnValue(child);
    readFileSpy.mockRejectedValue(new Error("ENOENT"));

    const promise = createService().executeCodex("/work", "main", "review");

    // Spawn failure: binary not found, no stderr output
    child.emit("error", new Error("spawn /usr/bin/codex ENOENT"));
    child.emit("close", null, null);

    const result = await promise;

    expect(result.exitCode).toBe(1);
    expect(result.rawOutput).toContain("spawn /usr/bin/codex ENOENT");
  });
});
