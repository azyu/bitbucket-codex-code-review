/** Workspace 관리에 필요한 인터페이스 */
export interface IWorktreeInfo {
  readonly worktreePath: string;
  readonly bareRepoPath: string;
}

export interface IPrepareWorktreeParams {
  readonly cloneUrl: string;
  readonly repositorySlug: string;
  readonly headBranch: string;
  readonly baseBranch: string;
  readonly headCommitHash: string;
}
