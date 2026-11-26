import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ServiceLogger } from "@lib/logger";
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { promisify } from "util";
import { dirname, join, resolve } from "path";
import { mkdir, rm, writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import {
  IWorktreeInfo,
  IPrepareWorktreeParams,
  IReviewDiff,
  IIncrementalDiff,
} from "./interfaces/workspace.interfaces";

const execFileAsync = promisify(execFile);
const REVIEW_DIFF_EXCLUDED_PATHS = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
];
const excludePathspecs = REVIEW_DIFF_EXCLUDED_PATHS.map(
  (path) => `:(exclude,glob)**/${path}`,
);
const includePathspecs = REVIEW_DIFF_EXCLUDED_PATHS.map(
  (path) => `:(glob)**/${path}`,
);

/** 리뷰 diff와 재리뷰 증분 diff가 같은 형식·제외 규칙을 쓰도록 인자를 한곳에서 만든다. */
function reviewDiffArgs(fromCommit: string): string[] {
  return [
    "diff",
    "--no-ext-diff",
    "--find-renames",
    "--unified=80",
    `${fromCommit}..HEAD`,
    "--",
    ".",
    ...excludePathspecs,
  ];
}

@Injectable()
export class WorkspaceService {
  private readonly logger = new ServiceLogger(WorkspaceService.name);
  private readonly basePath: string;
  /**
   * slug별 prepareWorktree 직렬화 큐. bare repo는 slug당 공유이므로 같은 repo의 두 job이
   * 동시에 `git fetch`를 돌리면 같은 ref lock을 다퉈 "cannot lock ref ... File exists"로
   * 죽는다. 소요의 대부분인 codex exec는 이 락 밖이라 병렬로 남는다.
   * ponytail: 프로세스 내 락 — 워커를 여러 프로세스/노드로 늘리면 파일 락이 필요하다.
   */
  private readonly prepareQueues = new Map<string, Promise<unknown>>();

  constructor(private readonly configService: ConfigService) {
    this.basePath = this.configService.get<string>(
      "workspace.basePath",
      "/tmp/code-review-workspaces",
    );
  }

  /** Validate and preserve repository identities without case-folding collisions. */
  private identityPathComponent(component: string): string {
    if (
      component === "." ||
      component === ".." ||
      !/^[a-zA-Z0-9._-]+$/.test(component)
    ) {
      throw new Error("Invalid repository identity");
    }

    return component.replace(/[A-Z]/g, (value) =>
      `~${value.charCodeAt(0).toString(16)}`,
    );
  }

  /** Validate that resolved path stays within workspace root */
  private assertWithinBasePath(targetPath: string): void {
    const resolved = resolve(targetPath);
    const resolvedBase = resolve(this.basePath);
    if (!resolved.startsWith(resolvedBase + "/") && resolved !== resolvedBase) {
      throw new Error(
        `Path traversal detected: ${resolved} is outside ${resolvedBase}`,
      );
    }
  }

  /** bare repo clone (or fetch) + worktree add */
  async prepareWorktree(
    params: IPrepareWorktreeParams,
  ): Promise<IWorktreeInfo> {
    const safeWorkspace = this.identityPathComponent(params.workspaceSlug);
    const safeSlug = this.identityPathComponent(params.repositorySlug);
    const bareRepoPath = join(
      this.basePath,
      "repos",
      safeWorkspace,
      `${safeSlug}.git`,
    );
    const worktreePath = join(
      this.basePath,
      "worktrees",
      safeWorkspace,
      safeSlug,
      String(params.reviewRunId),
    );

    this.assertWithinBasePath(bareRepoPath);
    this.assertWithinBasePath(worktreePath);

    return this.enqueueForSlug(bareRepoPath, async () => {
      const credentialPairs: Array<readonly [string, string] | undefined> =
        params.credentials.apiTokens.map((token) => ["x-token-auth", token]);
      if (params.credentials.username && params.credentials.appPassword) {
        credentialPairs.push([
          params.credentials.username,
          params.credentials.appPassword,
        ]);
      }
      if (credentialPairs.length === 0) credentialPairs.push(undefined);

      for (const [index, credentialPair] of credentialPairs.entries()) {
        const gitAuthEnv = credentialPair
          ? await this.createAskpassEnv(...credentialPair)
          : {};
        try {
          await this.ensureBareRepo(
            bareRepoPath,
            params.cloneUrl,
            gitAuthEnv,
            params.cloneTimeoutMs,
          );
          await this.fetchLatest(bareRepoPath, gitAuthEnv);
          break;
        } catch (error) {
          const canRetry =
            index < credentialPairs.length - 1 &&
            /\bfatal: Authentication failed\b/i.test(
              (error as Error).message,
            );
          if (!canRetry) throw error;
          this.logger.warn(
            `Git authentication failed for repo "${params.repositorySlug}" — trying the next configured credential`,
          );
        } finally {
          if (gitAuthEnv["GIT_ASKPASS"]) {
            await unlink(gitAuthEnv["GIT_ASKPASS"]).catch(() => {});
          }
        }
      }
      await this.createWorktree(
        bareRepoPath,
        worktreePath,
        params.headCommitHash,
      );

      return { worktreePath, bareRepoPath };
    });
  }

  /** 같은 slug의 작업을 앞 작업 종료 뒤로 미룬다. 앞 작업 실패가 뒤를 막지는 않는다. */
  private enqueueForSlug<T>(slug: string, task: () => Promise<T>): Promise<T> {
    // 저장하는 쪽은 catch로 감싸 rejection을 흡수한다 — 큐가 실패 한 건에 멈추지 않고,
    // 미처리 rejection도 생기지 않는다. 호출자는 원본 promise를 그대로 받는다.
    const current = (this.prepareQueues.get(slug) ?? Promise.resolve()).then(
      task,
    );
    this.prepareQueues.set(
      slug,
      current.catch(() => {}),
    );
    return current;
  }

  /** worktree 삭제 */
  async cleanupWorktree(
    worktreePath: string,
    bareRepoPath: string,
  ): Promise<void> {
    try {
      await execFileAsync(
        "git",
        ["worktree", "remove", "--force", worktreePath],
        {
          cwd: bareRepoPath,
        },
      );
      this.logger.debug(`Worktree removed: ${worktreePath}`);
    } catch (err) {
      this.logger.warn(`Worktree cleanup warning: ${(err as Error).message}`);
      // Fallback: rm -rf
      if (existsSync(worktreePath)) {
        await rm(worktreePath, { recursive: true, force: true });
      }
    }
  }

  /** PR 리뷰용 diff 생성: 최신 base branch와 HEAD의 merge-base부터 HEAD까지만 비교 */
  async createReviewDiff(
    worktreePath: string,
    baseBranch: string,
  ): Promise<IReviewDiff> {
    const baseRef = `refs/heads/${baseBranch}`;
    const mergeBaseArgs = ["merge-base", baseRef, "HEAD"];
    let mergeBase: string;
    try {
      ({ stdout: mergeBase } = await execFileAsync("git", mergeBaseArgs, {
        cwd: worktreePath,
        timeout: 30_000,
      }));
    } catch (err) {
      throw new Error(
        `Git command failed: git ${JSON.stringify(mergeBaseArgs)}: ${(err as Error).message}`,
      );
    }
    const baseCommit = mergeBase.trim();
    if (!baseCommit) {
      throw new Error(`Git merge-base failed for ${baseRef} and HEAD`);
    }

    const diffArgs = reviewDiffArgs(baseCommit);
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync("git", diffArgs, {
        cwd: worktreePath,
        timeout: 60_000,
        maxBuffer: 20 * 1024 * 1024,
      }));
    } catch (err) {
      throw new Error(
        `Git command failed: git ${JSON.stringify(diffArgs)} (base ref ${JSON.stringify(baseRef)}): ${(err as Error).message}`,
      );
    }

    const excludedChangedFiles = await this.listExcludedChangedFiles(
      worktreePath,
      baseCommit,
    );

    this.logger.debug(
      `Review diff created from merge-base ${baseCommit.substring(0, 12)} against HEAD`,
    );
    return { diff: stdout, mergeBase: baseCommit, excludedChangedFiles };
  }

  /**
   * 재리뷰용 `<prev>..HEAD` 증분 diff. prev가 HEAD의 조상일 때만 만든다 — rebase·force-push로
   * 조상이 아니면 증분이 의미가 없으므로 null을 돌려 전체 리뷰로 둔다.
   * 웹훅의 head 해시는 12자 축약형이라 전체 SHA로 풀어서 돌려준다.
   * 어떤 실패도 던지지 않는다 — 이 조회는 리뷰를 보조할 뿐 리뷰를 막으면 안 된다.
   */
  async createIncrementalDiff(
    worktreePath: string,
    previousCommitHash: string,
  ): Promise<IIncrementalDiff | null> {
    // git 인자로 들어가므로 옵션·리비전 문법이 섞이지 않게 16진 해시만 받는다.
    if (!/^[0-9a-f]{7,40}$/i.test(previousCommitHash)) return null;
    const git = async (args: string[], timeout = 30_000) =>
      (
        await execFileAsync("git", args, {
          cwd: worktreePath,
          timeout,
          maxBuffer: 20 * 1024 * 1024,
        })
      ).stdout;
    try {
      const commitHash = (
        await git([
          "rev-parse",
          "--verify",
          "--quiet",
          `${previousCommitHash}^{commit}`,
        ])
      ).trim();
      if (commitHash === (await git(["rev-parse", "HEAD"])).trim()) return null;
      // exit 1(조상 아님)도 execFile에서는 reject라 아래 catch로 떨어진다.
      await git(["merge-base", "--is-ancestor", commitHash, "HEAD"]);
      const diff = await git(reviewDiffArgs(commitHash), 60_000);
      return { commitHash, diff };
    } catch (err) {
      this.logger.warn(
        `Incremental diff from ${previousCommitHash} unavailable: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * diff 본문에서 제외한 경로 중 이번 PR에서 실제로 변경된 파일 목록.
   * 프롬프트에 명시해 "diff에 없음 = 변경 없음" 오탐을 막는다.
   * 조회 실패 시 null — 빈 배열(변경 없음)로 단정하면 같은 오탐이 재발한다.
   */
  private async listExcludedChangedFiles(
    worktreePath: string,
    baseCommit: string,
  ): Promise<string[] | null> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        [
          "diff",
          "--no-ext-diff",
          "--find-renames",
          "--name-status",
          `${baseCommit}..HEAD`,
          "--",
          ...includePathspecs,
        ],
        {
          cwd: worktreePath,
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
        },
      );

      return stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const fields = line.split("\t");
          const status = fields[0];
          const path = fields[fields.length - 1];
          return `${status} ${path}`;
        });
    } catch (err) {
      this.logger.warn(
        `Failed to list excluded changed files: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async ensureBareRepo(
    bareRepoPath: string,
    cloneUrl: string,
    gitAuthEnv: Record<string, string>,
    cloneTimeoutMs: number,
  ): Promise<void> {
    if (existsSync(bareRepoPath)) {
      let origin: string;
      try {
        ({ stdout: origin } = await execFileAsync(
          "git",
          ["config", "--local", "--get", "remote.origin.url"],
          {
            cwd: bareRepoPath,
            timeout: 30_000,
          },
        ));
      } catch {
        throw new Error("Cached repository origin could not be verified");
      }
      if (origin.trim() !== cloneUrl) {
        throw new Error(
          "Cached repository origin does not match requested repository",
        );
      }
      return;
    }
    await mkdir(dirname(bareRepoPath), { recursive: true });
    this.logger.log(`Cloning bare repo: ${cloneUrl}`);

    try {
      // 최초 clone은 서버측 pack 생성 대기까지 포함해 수 분이 걸릴 수 있고,
      // 타임아웃으로 죽으면 부분 디렉토리가 정리되어 재시도도 0부터 다시 받는다.
      await execFileAsync(
        "git",
        ["clone", "--bare", cloneUrl, bareRepoPath],
        {
          timeout: cloneTimeoutMs,
          env: { ...process.env, ...gitAuthEnv },
        },
      );
    } catch (err) {
      await rm(bareRepoPath, { recursive: true, force: true }).catch(() => {});
      throw new Error(
        `Git clone failed: ${(err as Error).message.replace(/https:\/\/[^@]+@/g, "https://***@")}`,
      );
    }
  }

  private async fetchLatest(
    bareRepoPath: string,
    gitAuthEnv: Record<string, string>,
  ): Promise<void> {
    // bare clone doesn't set a default refspec, so `fetch --all` fetches nothing.
    // Explicitly fetch all branches with a full refspec.
    await execFileAsync(
      "git",
      ["fetch", "origin", "+refs/heads/*:refs/heads/*", "--prune"],
      {
        cwd: bareRepoPath,
        // 오래 방치된 repo의 증분 fetch도 같은 서버측 pack 생성 대기를 겪는다
        timeout: 300_000,
        env: { ...process.env, ...gitAuthEnv },
      },
    );
  }

  private async createWorktree(
    bareRepoPath: string,
    worktreePath: string,
    commitHash: string,
  ): Promise<void> {
    await mkdir(dirname(worktreePath), { recursive: true });

    if (existsSync(worktreePath)) {
      await rm(worktreePath, { recursive: true, force: true });
    }

    // 디렉터리를 지워도 git 등록은 남는다. 등록이 남은 채로 add하면
    // "missing but already registered"로 실패하고, 재시도도 같은 이유로 죽어
    // 그 커밋은 사람이 손으로 prune하기 전까지 영구히 리뷰 불가가 된다.
    // 리뷰 도중 컨테이너가 재시작되면(배포·반영) 정리 경로를 못 타므로 실제로 발생한다.
    // prune은 디렉터리가 사라진 등록만 지우고 진행 중인 worktree는 건너뛴다.
    await execFileAsync("git", ["worktree", "prune"], {
      cwd: bareRepoPath,
      timeout: 30_000,
    });

    await execFileAsync(
      "git",
      ["worktree", "add", "--detach", worktreePath, commitHash],
      {
        cwd: bareRepoPath,
        timeout: 30_000,
      },
    );
    this.logger.debug(`Worktree created at: ${worktreePath}`);
  }

  private async createAskpassEnv(
    user: string,
    password: string,
  ): Promise<Record<string, string>> {
    // 동시 실행되는 job끼리 같은 파일을 쓰면 먼저 끝난 쪽의 unlink가 아직 git을
    // 돌리는 쪽의 인증을 깬다 — 타임스탬프만으로는 같은 ms 충돌을 막지 못한다.
    const scriptPath = join(this.basePath, `.askpass-${randomUUID()}.sh`);
    await mkdir(this.basePath, { recursive: true });

    // GIT_ASKPASS is invoked with a prompt arg: "Username for ..." or "Password for ..."
    const script = [
      "#!/bin/sh",
      'case "$1" in',
      `  *sername*) echo '${user.replace(/'/g, "'\\''")}';;`,
      `  *assword*) echo '${password.replace(/'/g, "'\\''")}';;`,
      "esac",
    ].join("\n");

    await writeFile(scriptPath, script, { mode: 0o700 });
    return {
      GIT_ASKPASS: scriptPath,
      GIT_TERMINAL_PROMPT: "0",
    };
  }
}
