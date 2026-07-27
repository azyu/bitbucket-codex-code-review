import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ConfigService } from "@nestjs/config";
import { execFile } from "child_process";
import { WorkspaceService } from "./workspace.service";

jest.mock("@lib/logger", () => ({
  ServiceLogger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  })),
}));

jest.mock("child_process", () => ({
  execFile: jest.fn(),
}));

type ExecFileCallback = (
  error: Error | null,
  result?: { stdout: string; stderr: string },
) => void;

describe("WorkspaceService", () => {
  const execFileMock = execFile as unknown as jest.Mock;
  let basePath: string;
  let service: WorkspaceService;
  let configValues: Record<string, unknown>;

  const buildConfigService = (): ConfigService =>
    ({
      get: jest.fn((key: string, defaultValue?: unknown) =>
        key in configValues ? configValues[key] : defaultValue,
      ),
    }) as unknown as ConfigService;

  const mockExecFileSuccess = (stdout = "") => {
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: Record<string, unknown>,
        callback: ExecFileCallback,
      ) => callback(null, { stdout, stderr: "" }),
    );
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    basePath = await mkdtemp(join(tmpdir(), "workspace-service-spec-"));
    configValues = {
      "workspace.basePath": basePath,
      "bitbucket.repoTokens": {},
      "bitbucket.apiToken": "",
      "bitbucket.username": "",
      "bitbucket.appPassword": "",
    };
    service = new WorkspaceService(buildConfigService());
    mockExecFileSuccess();
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it("prepares a sanitized worktree with repo token auth and removes askpass script", async () => {
    configValues["bitbucket.repoTokens"] = {
      "repo/a..": "repo-token",
    };

    const result = await service.prepareWorktree({
      cloneUrl: "https://bitbucket.org/workspace/repo-a.git",
      repositorySlug: "repo/a..",
      headBranch: "feature",
      baseBranch: "main",
      headCommitHash: "abcdef1234567890",
    });

    expect(result).toEqual({
      bareRepoPath: join(basePath, "repos", "repoa.git"),
      worktreePath: join(basePath, "worktrees", "repoa-abcdef12"),
    });
    expect(execFileMock).toHaveBeenNthCalledWith(
      1,
      "git",
      [
        "clone",
        "--bare",
        "https://bitbucket.org/workspace/repo-a.git",
        join(basePath, "repos", "repoa.git"),
      ],
      expect.objectContaining({
        env: expect.objectContaining({
          GIT_TERMINAL_PROMPT: "0",
        }),
      }),
      expect.any(Function),
    );
    expect(execFileMock).toHaveBeenNthCalledWith(
      2,
      "git",
      ["fetch", "origin", "+refs/heads/*:refs/heads/*", "--prune"],
      expect.objectContaining({
        cwd: join(basePath, "repos", "repoa.git"),
      }),
      expect.any(Function),
    );
    expect(execFileMock).toHaveBeenNthCalledWith(
      3,
      "git",
      [
        "worktree",
        "add",
        "--detach",
        join(basePath, "worktrees", "repoa-abcdef12"),
        "abcdef1234567890",
      ],
      expect.objectContaining({
        cwd: join(basePath, "repos", "repoa.git"),
      }),
      expect.any(Function),
    );

    const cloneOptions = execFileMock.mock.calls[0][2] as {
      env: Record<string, string>;
    };
    const askpassPath = cloneOptions.env.GIT_ASKPASS;
    await expect(stat(askpassPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects repository slugs that sanitize to an empty value", async () => {
    await expect(
      service.prepareWorktree({
        cloneUrl: "https://bitbucket.org/workspace/repo-a.git",
        repositorySlug: "../",
        headBranch: "feature",
        baseBranch: "main",
        headCommitHash: "abcdef1234567890",
      }),
    ).rejects.toThrow("Invalid repository slug: ../");

    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("redacts credentials from clone errors", async () => {
    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: ExecFileCallback,
      ) => {
        if (args[0] === "clone") {
          callback(
            new Error(
              "fatal: could not read https://user:secret@bitbucket.org/ws/repo.git",
            ),
          );
          return;
        }
        callback(null, { stdout: "", stderr: "" });
      },
    );

    await expect(
      service.prepareWorktree({
        cloneUrl: "https://bitbucket.org/workspace/repo-a.git",
        repositorySlug: "repo-a",
        headBranch: "feature",
        baseBranch: "main",
        headCommitHash: "abcdef1234567890",
      }),
    ).rejects.toThrow(
      "Git clone failed: fatal: could not read https://***@bitbucket.org/ws/repo.git",
    );
  });

  it("falls back to rm when git worktree cleanup fails", async () => {
    const worktreePath = join(basePath, "worktrees", "repo-a-abcdef12");
    await rm(worktreePath, { recursive: true, force: true });
    await import("fs/promises").then(({ mkdir }) =>
      mkdir(worktreePath, { recursive: true }),
    );
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: Record<string, unknown>,
        callback: ExecFileCallback,
      ) => callback(new Error("not a registered worktree")),
    );

    await service.cleanupWorktree(worktreePath, join(basePath, "repos/repo.git"));

    await expect(stat(worktreePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("creates review diff from merge-base to HEAD", async () => {
    execFileMock
      .mockImplementationOnce(
        (
          _command: string,
          _args: string[],
          _options: Record<string, unknown>,
          callback: ExecFileCallback,
        ) => callback(null, { stdout: "basecommit123\n", stderr: "" }),
      )
      .mockImplementationOnce(
        (
          _command: string,
          _args: string[],
          _options: Record<string, unknown>,
          callback: ExecFileCallback,
        ) => callback(null, { stdout: "diff --git a/file b/file", stderr: "" }),
      )
      .mockImplementationOnce(
        (
          _command: string,
          _args: string[],
          _options: Record<string, unknown>,
          callback: ExecFileCallback,
        ) =>
          callback(null, {
            stdout: "M\tpnpm-lock.yaml\nR100\told.lock\tapps/web/yarn.lock\n",
            stderr: "",
          }),
      );

    const result = await service.createReviewDiff("/tmp/worktree", "main");

    expect(result.diff).toBe("diff --git a/file b/file");
    expect(result.excludedChangedFiles).toEqual([
      "M pnpm-lock.yaml",
      "R100 apps/web/yarn.lock",
    ]);
    expect(execFileMock).toHaveBeenNthCalledWith(
      1,
      "git",
      ["merge-base", "refs/heads/main", "HEAD"],
      { cwd: "/tmp/worktree", timeout: 30_000 },
      expect.any(Function),
    );
    expect(execFileMock).toHaveBeenNthCalledWith(
      2,
      "git",
      [
        "diff",
        "--no-ext-diff",
        "--find-renames",
        "--unified=80",
        "basecommit123..HEAD",
        "--",
        ".",
        ":(exclude,glob)**/pnpm-lock.yaml",
        ":(exclude,glob)**/package-lock.json",
        ":(exclude,glob)**/yarn.lock",
        ":(exclude,glob)**/bun.lockb",
      ],
      {
        cwd: "/tmp/worktree",
        timeout: 60_000,
        maxBuffer: 20 * 1024 * 1024,
      },
      expect.any(Function),
    );
    expect(execFileMock).toHaveBeenNthCalledWith(
      3,
      "git",
      [
        "diff",
        "--no-ext-diff",
        "--find-renames",
        "--name-status",
        "basecommit123..HEAD",
        "--",
        ":(glob)**/pnpm-lock.yaml",
        ":(glob)**/package-lock.json",
        ":(glob)**/yarn.lock",
        ":(glob)**/bun.lockb",
      ],
      {
        cwd: "/tmp/worktree",
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      },
      expect.any(Function),
    );
  });

  it("returns an empty excluded file list when no lock file changed", async () => {
    execFileMock
      .mockImplementationOnce(
        (
          _command: string,
          _args: string[],
          _options: Record<string, unknown>,
          callback: ExecFileCallback,
        ) => callback(null, { stdout: "basecommit123\n", stderr: "" }),
      )
      .mockImplementationOnce(
        (
          _command: string,
          _args: string[],
          _options: Record<string, unknown>,
          callback: ExecFileCallback,
        ) => callback(null, { stdout: "diff --git a/file b/file", stderr: "" }),
      )
      .mockImplementationOnce(
        (
          _command: string,
          _args: string[],
          _options: Record<string, unknown>,
          callback: ExecFileCallback,
        ) => callback(null, { stdout: "\n", stderr: "" }),
      );

    const result = await service.createReviewDiff("/tmp/worktree", "main");

    expect(result.excludedChangedFiles).toEqual([]);
  });

  it("returns null excluded files when the lookup fails", async () => {
    execFileMock
      .mockImplementationOnce(
        (
          _command: string,
          _args: string[],
          _options: Record<string, unknown>,
          callback: ExecFileCallback,
        ) => callback(null, { stdout: "basecommit123\n", stderr: "" }),
      )
      .mockImplementationOnce(
        (
          _command: string,
          _args: string[],
          _options: Record<string, unknown>,
          callback: ExecFileCallback,
        ) => callback(null, { stdout: "diff --git a/file b/file", stderr: "" }),
      )
      .mockImplementationOnce(
        (
          _command: string,
          _args: string[],
          _options: Record<string, unknown>,
          callback: ExecFileCallback,
        ) => callback(new Error("git failed")),
      );

    const result = await service.createReviewDiff("/tmp/worktree", "main");

    expect(result.diff).toBe("diff --git a/file b/file");
    expect(result.excludedChangedFiles).toBeNull();
  });

  it("throws when merge-base returns an empty commit", async () => {
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: Record<string, unknown>,
        callback: ExecFileCallback,
      ) => callback(null, { stdout: "\n", stderr: "" }),
    );

    await expect(service.createReviewDiff("/tmp/worktree", "main")).rejects.toThrow(
      "Git merge-base failed for refs/heads/main and HEAD",
    );
  });
});
