import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ServiceLogger } from "@lib/logger";
import { execFile } from "child_process";
import { promisify } from "util";
import { join, resolve } from "path";
import { mkdir, rm, writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import {
  IWorktreeInfo,
  IPrepareWorktreeParams,
  IReviewDiff,
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

@Injectable()
export class WorkspaceService {
  private readonly logger = new ServiceLogger(WorkspaceService.name);
  private readonly basePath: string;
  private readonly cloneTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.basePath = this.configService.get<string>(
      "workspace.basePath",
      "/tmp/code-review-workspaces",
    );
    this.cloneTimeoutMs = this.configService.get<number>(
      "workspace.cloneTimeoutMs",
      600_000,
    );
  }

  /** Sanitize repository slug to prevent path traversal */
  private sanitizeSlug(slug: string): string {
    return slug.replace(/[^a-zA-Z0-9_-]/g, "");
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
    const safeSlug = this.sanitizeSlug(params.repositorySlug);
    if (!safeSlug) {
      throw new Error(`Invalid repository slug: ${params.repositorySlug}`);
    }

    const bareRepoPath = join(this.basePath, "repos", `${safeSlug}.git`);
    const worktreePath = join(
      this.basePath,
      "worktrees",
      `${safeSlug}-${params.headCommitHash.substring(0, 8)}`,
    );

    this.assertWithinBasePath(bareRepoPath);
    this.assertWithinBasePath(worktreePath);

    const gitAuthEnv = await this.buildGitAuthEnv(params.repositorySlug);
    try {
      await this.ensureBareRepo(bareRepoPath, params.cloneUrl, gitAuthEnv);
      await this.fetchLatest(bareRepoPath, gitAuthEnv);
    } finally {
      if (gitAuthEnv["GIT_ASKPASS"]) {
        await unlink(gitAuthEnv["GIT_ASKPASS"]).catch(() => {});
      }
    }
    await this.createWorktree(
      bareRepoPath,
      worktreePath,
      params.headCommitHash,
    );

    return { worktreePath, bareRepoPath };
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
    const { stdout: mergeBase } = await execFileAsync(
      "git",
      ["merge-base", baseRef, "HEAD"],
      {
        cwd: worktreePath,
        timeout: 30_000,
      },
    );
    const baseCommit = mergeBase.trim();
    if (!baseCommit) {
      throw new Error(`Git merge-base failed for ${baseRef} and HEAD`);
    }

    const { stdout } = await execFileAsync(
      "git",
      [
        "diff",
        "--no-ext-diff",
        "--find-renames",
        "--unified=80",
        `${baseCommit}..HEAD`,
        "--",
        ".",
        ...excludePathspecs,
      ],
      {
        cwd: worktreePath,
        timeout: 60_000,
        maxBuffer: 20 * 1024 * 1024,
      },
    );

    const excludedChangedFiles = await this.listExcludedChangedFiles(
      worktreePath,
      baseCommit,
    );

    this.logger.debug(
      `Review diff created from merge-base ${baseCommit.substring(0, 12)} against HEAD`,
    );
    return { diff: stdout, excludedChangedFiles };
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
  ): Promise<void> {
    if (existsSync(bareRepoPath)) {
      return;
    }

    await mkdir(join(this.basePath, "repos"), { recursive: true });
    this.logger.log(`Cloning bare repo: ${cloneUrl}`);

    try {
      // 최초 clone은 서버측 pack 생성 대기까지 포함해 수 분이 걸릴 수 있고,
      // 타임아웃으로 죽으면 부분 디렉토리가 정리되어 재시도도 0부터 다시 받는다.
      await execFileAsync(
        "git",
        ["clone", "--bare", cloneUrl, bareRepoPath],
        {
          timeout: this.cloneTimeoutMs,
          env: { ...process.env, ...gitAuthEnv },
        },
      );
    } catch (err) {
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
    await mkdir(join(this.basePath, "worktrees"), { recursive: true });

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

  /**
   * Build GIT_ASKPASS env to avoid embedding credentials in clone URLs.
   * Auth resolution order: repoTokens[repoSlug] → apiToken → username/appPassword.
   */
  private async buildGitAuthEnv(
    repoSlug: string,
  ): Promise<Record<string, string>> {
    const repoTokens =
      this.configService.get<Record<string, string>>("bitbucket.repoTokens") ??
      {};
    const repoToken = repoTokens[repoSlug];
    if (repoToken) {
      return this.createAskpassEnv("x-token-auth", repoToken);
    }

    const apiToken = this.configService.get<string>("bitbucket.apiToken", "");
    if (apiToken) {
      return this.createAskpassEnv("x-token-auth", apiToken);
    }

    const username = this.configService.get<string>("bitbucket.username", "");
    const appPassword = this.configService.get<string>(
      "bitbucket.appPassword",
      "",
    );
    if (!username || !appPassword) {
      this.logger.warn(
        `No Bitbucket auth configured for repo "${repoSlug}" — git clone may fail`,
      );
      return {};
    }

    return this.createAskpassEnv(username, appPassword);
  }

  private async createAskpassEnv(
    user: string,
    password: string,
  ): Promise<Record<string, string>> {
    const scriptPath = join(this.basePath, `.askpass-${Date.now()}.sh`);
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
