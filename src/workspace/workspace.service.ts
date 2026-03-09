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
} from "./interfaces/workspace.interfaces";

const execFileAsync = promisify(execFile);

@Injectable()
export class WorkspaceService {
  private readonly logger = new ServiceLogger(WorkspaceService.name);
  private readonly basePath: string;

  constructor(private readonly configService: ConfigService) {
    this.basePath = this.configService.get<string>(
      "workspace.basePath",
      "/tmp/code-review-workspaces",
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

    const gitAuthEnv = await this.buildGitAuthEnv();
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
      await execFileAsync(
        "git",
        ["clone", "--bare", cloneUrl, bareRepoPath],
        {
          timeout: 120_000,
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
        timeout: 60_000,
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
   * Creates a temporary shell script that responds to git's username/password prompts.
   */
  private async buildGitAuthEnv(): Promise<Record<string, string>> {
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
        "No Bitbucket auth configured — git clone may fail for private repos",
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
