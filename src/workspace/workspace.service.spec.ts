import { mkdir, mkdtemp, rm, stat, writeFile } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { ConfigService } from "@nestjs/config";
import {
  execFile,
  type ExecFileOptionsWithStringEncoding,
} from "child_process";
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

const RUNTIME_PARAMS = {
  workspaceSlug: "workspace",
  reviewRunId: 99,
  cloneTimeoutMs: 900_000,
  credentials: { apiTokens: ["repo-token"] },
};

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

  const useRealExecFile = () => {
    const realExecFile = jest.requireActual("child_process")
      .execFile as typeof execFile;
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        options: ExecFileOptionsWithStringEncoding,
        callback: ExecFileCallback,
      ) =>
        realExecFile(command, args, options, (error, stdout, stderr) =>
          callback(error, { stdout, stderr }),
        ),
    );
    return promisify(realExecFile);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    basePath = await mkdtemp(join(tmpdir(), "workspace-service-spec-"));
    configValues = {
      "workspace.basePath": basePath,
      "workspace.cloneTimeoutMs": 900_000,
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

  it("prepares a worktree with repo token auth and removes askpass script", async () => {
    const result = await service.prepareWorktree({
      ...RUNTIME_PARAMS,
      cloneUrl: "https://bitbucket.org/workspace/repo-a.git",
      repositorySlug: "repo-a",
      headBranch: "feature",
      baseBranch: "main",
      headCommitHash: "abcdef1234567890",
    });

    expect(result).toEqual({
      bareRepoPath: join(basePath, "repos", "workspace", "repo-a.git"),
      worktreePath: join(
        basePath,
        "worktrees",
        "workspace",
        "repo-a",
        "99",
      ),
    });
    expect(execFileMock).toHaveBeenNthCalledWith(
      1,
      "git",
      [
        "clone",
        "--bare",
        "https://bitbucket.org/workspace/repo-a.git",
        join(basePath, "repos", "workspace", "repo-a.git"),
      ],
      expect.objectContaining({
        timeout: 900_000,
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
        cwd: join(basePath, "repos", "workspace", "repo-a.git"),
      }),
      expect.any(Function),
    );
    expect(execFileMock).toHaveBeenNthCalledWith(
      3,
      "git",
      ["worktree", "prune"],
      expect.objectContaining({
        cwd: join(basePath, "repos", "workspace", "repo-a.git"),
      }),
      expect.any(Function),
    );
    expect(execFileMock).toHaveBeenNthCalledWith(
      4,
      "git",
      [
        "worktree",
        "add",
        "--detach",
        join(basePath, "worktrees", "workspace", "repo-a", "99"),
        "abcdef1234567890",
      ],
      expect.objectContaining({
        cwd: join(basePath, "repos", "workspace", "repo-a.git"),
      }),
      expect.any(Function),
    );

    const cloneOptions = execFileMock.mock.calls[0][2] as {
      env: Record<string, string>;
    };
    const askpassPath = cloneOptions.env.GIT_ASKPASS;
    await expect(stat(askpassPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps case-distinct identities on different paths", async () => {
    const base = {
      ...RUNTIME_PARAMS,
      cloneUrl: "https://bitbucket.org/workspace/repo.git",
      headBranch: "feature",
      baseBranch: "main",
      headCommitHash: "abcdef1234567890",
    };

    const first = await service.prepareWorktree({
      ...base,
      repositorySlug: "Repo",
    });
    const second = await service.prepareWorktree({
      ...base,
      repositorySlug: "repo",
    });

    expect(first.bareRepoPath.toLowerCase()).not.toBe(
      second.bareRepoPath.toLowerCase(),
    );
    expect(first.worktreePath.toLowerCase()).not.toBe(
      second.worktreePath.toLowerCase(),
    );
  });

  it("recovers when the worktree directory is gone but its git registration survived", async () => {
    // 리뷰 도중 컨테이너가 재시작되면(배포·설정 반영) 정리 경로를 못 탄다. 다음 시도는
    // 남은 디렉터리만 지우고 add하므로 "missing but already registered"로 죽고, 재시도도
    // 같은 이유로 죽어 그 커밋은 사람이 손으로 prune하기 전까지 영구히 리뷰 불가가 된다.
    // 실제 git으로 돌려야 잡히는 회귀라 이 케이스만 mock을 걷어낸다.
    const git = useRealExecFile();

    const sourcePath = join(basePath, "source");
    await mkdir(sourcePath, { recursive: true });
    await git("git", ["init", "-q", "--initial-branch=main", sourcePath]);
    await git(
      "git",
      [
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.com",
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "init",
      ],
      { cwd: sourcePath },
    );
    const { stdout } = await git("git", ["rev-parse", "HEAD"], {
      cwd: sourcePath,
    });
    const params = {
      ...RUNTIME_PARAMS,
      cloneUrl: sourcePath,
      repositorySlug: "repo-a",
      headBranch: "main",
      baseBranch: "main",
      headCommitHash: stdout.trim(),
    };

    const { worktreePath } = await service.prepareWorktree(params);
    await rm(worktreePath, { recursive: true, force: true }); // 컨테이너가 죽은 자리

    await expect(service.prepareWorktree(params)).resolves.toEqual({
      worktreePath,
      bareRepoPath: join(basePath, "repos", "workspace", "repo-a.git"),
    });
    expect(existsSync(worktreePath)).toBe(true);
  }, 30_000);

  it("prepares dotted and undotted identities at their own commits", async () => {
    const git = useRealExecFile();
    const fixtures: Array<{
      slug: string;
      sourcePath: string;
      commit: string;
    }> = [];

    for (const slug of ["foo.bar", "foobar"]) {
      const sourcePath = join(basePath, `source-${slug}`);
      await mkdir(sourcePath, { recursive: true });
      await git("git", ["init", "-q", "--initial-branch=main", sourcePath]);
      await git(
        "git",
        [
          "-c",
          "user.name=t",
          "-c",
          "user.email=t@example.com",
          "commit",
          "-q",
          "--allow-empty",
          "-m",
          slug,
        ],
        { cwd: sourcePath },
      );
      const { stdout } = await git("git", ["rev-parse", "HEAD"], {
        cwd: sourcePath,
      });
      fixtures.push({ slug, sourcePath, commit: stdout.trim() });
    }

    expect(fixtures[0]!.commit).not.toBe(fixtures[1]!.commit);
    for (const [index, fixture] of fixtures.entries()) {
      const prepared = await service.prepareWorktree({
        ...RUNTIME_PARAMS,
        cloneUrl: fixture.sourcePath,
        repositorySlug: fixture.slug,
        reviewRunId: index + 1,
        headBranch: "main",
        baseBranch: "main",
        headCommitHash: fixture.commit,
      });
      const { stdout } = await git("git", ["rev-parse", "HEAD"], {
        cwd: prepared.worktreePath,
      });

      expect(stdout.trim()).toBe(fixture.commit);
      expect(prepared.bareRepoPath).toBe(
        join(basePath, "repos", "workspace", `${fixture.slug}.git`),
      );
    }
  }, 30_000);

  describe("per-slug serialization", () => {
    // worker concurrency > 1이면 같은 repo의 두 job이 동시에 들어온다(같은 PR의 연속 푸시,
    // 한 repo에 몰린 PR들). bare repo는 slug당 공유이므로 두 `git fetch`가 겹치면 같은 ref
    // lock을 다퉈 "cannot lock ref ... File exists"로 죽는다.
    const pendingFetches: Array<() => void> = [];

    /** fetch만 붙잡아두고 나머지 git 호출은 즉시 성공시킨다 */
    const gateFetchCalls = (failFirst = false): void => {
      execFileMock.mockImplementation(
        (
          _command: string,
          args: string[],
          _options: Record<string, unknown>,
          callback: ExecFileCallback,
        ) => {
          if (args[0] === "fetch") {
            const isFirst = pendingFetches.length === 0;
            pendingFetches.push(() =>
              failFirst && isFirst
                ? callback(new Error("cannot lock ref 'refs/heads/main'"))
                : callback(null, { stdout: "", stderr: "" }),
            );
            return;
          }
          callback(null, { stdout: "", stderr: "" });
        },
      );
    };

    const params = (slug: string, headCommitHash: string) => ({
      ...RUNTIME_PARAMS,
      cloneUrl: `https://bitbucket.org/workspace/${slug}.git`,
      reviewRunId: headCommitHash.startsWith("a") ? 1 : 2,
      repositorySlug: slug,
      headBranch: "feature",
      baseBranch: "main",
      headCommitHash,
    });

    /**
     * 실제 fs 왕복 한 번 + 이벤트 루프 한 바퀴. 벽시계와 달리 러너가 느려지면 tick도 같이
     * 느려지므로 "몇 tick"은 부하와 무관하게 대략 일정한 진행량을 뜻한다. 순서 보장은 없다 —
     * 정확성은 pendingFetches.length 폴링에서 나오고 tick은 진행시킬 뿐이다.
     */
    const tick = async (): Promise<void> => {
      await stat(basePath).catch(() => {});
      await new Promise((resolve) => setImmediate(resolve));
    };

    /**
     * pendingFetches가 n건이 될 때까지 기다린다 — 시간이 아니라 상태다. 반환값은 소요 tick 수로,
     * 이 러너에서 job 하나가 fetch까지 가는 비용이다. 직렬화 가드의 대기량을 여기서 파생시킨다.
     * 도달하지 못하면 toHaveLength가 그대로 실패한다. 정상 경로에서는 상한 전에 빠져나가므로
     * 상한 비용은 실제 실패 때만 든다.
     */
    const awaitFetches = async (n: number): Promise<number> => {
      let ticks = 0;
      while (pendingFetches.length < n && ticks < 2_000) {
        await tick();
        ticks += 1;
      }
      expect(pendingFetches).toHaveLength(n);
      return ticks;
    };

    /**
     * 직렬화 가드. 막혀 있지 않았다면 fetch까지 갔을 만큼 돌린 뒤에도 n건에 머무는지 본다.
     * 고정 ms였다면 느린 러너에서 가드가 조용히 무력해지므로, 대기량은 같은 러너에서 방금
     * 측정한 budget에서 뽑는다.
     */
    const expectNoFurtherFetch = async (
      n: number,
      budget: number,
    ): Promise<void> => {
      const grace = Math.max(500, budget * 20);
      for (let i = 0; i < grace; i += 1) await tick();
      expect(pendingFetches).toHaveLength(n);
    };

    beforeEach(() => {
      pendingFetches.length = 0;
    });

    afterEach(() => {
      jest.restoreAllMocks(); // Date.now 스파이가 다른 테스트로 새지 않게
    });

    it("holds a second job for the same slug until the first finishes", async () => {
      gateFetchCalls();

      const first = service.prepareWorktree(params("repo-a", "aaaaaaaa1111"));
      const budget = await awaitFetches(1);
      const second = service.prepareWorktree(params("repo-a", "bbbbbbbb2222"));
      await expectNoFurtherFetch(1, budget);

      pendingFetches[0]!();
      await expect(first).resolves.toMatchObject({
        worktreePath: join(basePath, "worktrees", "workspace", "repo-a", "1"),
      });
      await awaitFetches(2);

      pendingFetches[1]!();
      await expect(second).resolves.toMatchObject({
        worktreePath: join(basePath, "worktrees", "workspace", "repo-a", "2"),
      });
    });

    it("runs different slugs in parallel", async () => {
      gateFetchCalls();

      const first = service.prepareWorktree(params("repo-a", "aaaaaaaa1111"));
      await awaitFetches(1);
      const second = service.prepareWorktree(params("repo-b", "bbbbbbbb2222"));
      await awaitFetches(2);

      pendingFetches[0]!();
      pendingFetches[1]!();
      await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    });

    it("gives each concurrent job its own askpass script", async () => {
      // 파일명이 Date.now()뿐이면 같은 ms에 시작한 두 job이 같은 경로를 쓰고,
      // 먼저 끝난 쪽의 unlink가 아직 fetch 중인 쪽의 인증을 깬다.
      jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
      configValues["bitbucket.apiToken"] = "api-token";
      gateFetchCalls();

      const first = service.prepareWorktree(params("repo-a", "aaaaaaaa1111"));
      await awaitFetches(1);
      const second = service.prepareWorktree(params("repo-b", "bbbbbbbb2222"));
      await awaitFetches(2);

      const askpassPaths = execFileMock.mock.calls
        .filter((call) => (call[1] as string[])[0] === "clone")
        .map(
          (call) =>
            (call[2] as { env: Record<string, string> }).env["GIT_ASKPASS"],
        );

      expect(askpassPaths).toHaveLength(2);
      expect(askpassPaths[0]).not.toEqual(askpassPaths[1]);

      pendingFetches[0]!();
      pendingFetches[1]!();
      await Promise.all([first, second]);
    });

    it("keeps the queue moving when the preceding job fails", async () => {
      gateFetchCalls(true);

      // rejects 매처는 await 시점에야 핸들러를 붙인다 — 먼저 catch로 받아둬야
      // 미처리 rejection이 러너를 물지 않는다.
      const first = service
        .prepareWorktree(params("repo-a", "aaaaaaaa1111"))
        .catch((err: Error) => err.message);
      const budget = await awaitFetches(1);
      const second = service.prepareWorktree(params("repo-a", "bbbbbbbb2222"));
      await expectNoFurtherFetch(1, budget);

      pendingFetches[0]!();
      await expect(first).resolves.toContain("cannot lock ref");
      await awaitFetches(2);

      pendingFetches[1]!();
      await expect(second).resolves.toMatchObject({
        worktreePath: join(basePath, "worktrees", "workspace", "repo-a", "2"),
      });
    });
  });

  it("rejects dot, traversal, separator, and control identities", async () => {
    const hostileIdentities = [
      ["workspace", "."],
      ["workspace", ".."],
      ["..", "repo-a"],
      ["workspace", "../repo-a"],
      ["workspace", "repo/a"],
      ["workspace", "repo\u0000a"],
    ] as const;

    for (const [workspaceSlug, repositorySlug] of hostileIdentities) {
      await expect(
        service.prepareWorktree({
          ...RUNTIME_PARAMS,
          cloneUrl: "https://bitbucket.org/workspace/repo-a.git",
          workspaceSlug,
          repositorySlug,
          headBranch: "feature",
          baseBranch: "main",
          headCommitHash: "abcdef1234567890",
        }),
      ).rejects.toThrow("Invalid repository identity");
    }

    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("rejects a mismatched cached origin without fetching or deleting it", async () => {
    const bareRepoPath = join(basePath, "repos", "workspace", "repo-a.git");
    const markerPath = join(bareRepoPath, "owned-by-another-repository");
    await mkdir(bareRepoPath, { recursive: true });
    await writeFile(markerPath, "keep");
    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: ExecFileCallback,
      ) => {
        if (args[0] === "config") {
          callback(null, {
            stdout: "https://bitbucket.org/other/repository.git\n",
            stderr: "",
          });
          return;
        }
        callback(null, { stdout: "", stderr: "" });
      },
    );

    await expect(
      service.prepareWorktree({
        ...RUNTIME_PARAMS,
        cloneUrl: "https://bitbucket.org/workspace/repo-a.git",
        repositorySlug: "repo-a",
        headBranch: "feature",
        baseBranch: "main",
        headCommitHash: "abcdef1234567890",
      }),
    ).rejects.toThrow(
      "Cached repository origin does not match requested repository",
    );

    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["config", "--local", "--get", "remote.origin.url"],
      { cwd: bareRepoPath, timeout: 30_000 },
      expect.any(Function),
    );
    expect(readFileSync(markerPath, "utf8")).toBe("keep");
  });

  it("retries authentication with the next credential only", async () => {
    const askpassPaths: string[] = [];
    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        options: { env?: Record<string, string> },
        callback: ExecFileCallback,
      ) => {
        const askpassPath = options.env?.["GIT_ASKPASS"];
        if (args[0] === "clone" && askpassPath) {
          askpassPaths.push(askpassPath);
          const script = readFileSync(askpassPath, "utf8");
          if (script.includes("stale-token")) {
            callback(new Error("fatal: Authentication failed"));
            return;
          }
        }
        callback(null, { stdout: "", stderr: "" });
      },
    );

    await service.prepareWorktree({
      ...RUNTIME_PARAMS,
      cloneUrl: "https://bitbucket.org/workspace/repo-a.git",
      repositorySlug: "repo-a",
      headBranch: "feature",
      baseBranch: "main",
      headCommitHash: "abcdef1234567890",
      credentials: { apiTokens: ["stale-token", "global-token"] },
    });

    expect(askpassPaths).toHaveLength(2);
    for (const path of askpassPaths) expect(existsSync(path)).toBe(false);
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
        ...RUNTIME_PARAMS,
        cloneUrl: "https://bitbucket.org/workspace/repo-a.git",
        repositorySlug: "repo-a",
        headBranch: "feature",
        baseBranch: "main",
        headCommitHash: "abcdef1234567890",
        credentials: { apiTokens: ["repo-token", "global-token"] },
      }),
    ).rejects.toThrow(
      "Git clone failed: fatal: could not read https://***@bitbucket.org/ws/repo.git",
    );
    expect(execFileMock).toHaveBeenCalledTimes(1);
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

  it("attributes an oversized review diff to its exact git comparison", async () => {
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
        ) => callback(new Error("stdout maxBuffer length exceeded")),
      );

    await expect(
      service.createReviewDiff("/tmp/worktree", "develop"),
    ).rejects.toThrow(
      'Git command failed: git ["diff","--no-ext-diff","--find-renames","--unified=80","basecommit123..HEAD","--",".",":(exclude,glob)**/pnpm-lock.yaml",":(exclude,glob)**/package-lock.json",":(exclude,glob)**/yarn.lock",":(exclude,glob)**/bun.lockb"] (base ref "refs/heads/develop"): stdout maxBuffer length exceeded',
    );
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
