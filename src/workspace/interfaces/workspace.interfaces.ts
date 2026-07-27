/** Workspace 관리에 필요한 인터페이스 */
export interface IWorktreeInfo {
  readonly worktreePath: string;
  readonly bareRepoPath: string;
}

export interface IReviewDiff {
  /** 리뷰 대상 unified diff (lock 파일 등 제외 경로는 빠져 있음) */
  readonly diff: string;
  /** diff에서 제외됐지만 실제로 변경된 파일 목록 (예: "M pnpm-lock.yaml") */
  readonly excludedChangedFiles: readonly string[];
}

export interface IPrepareWorktreeParams {
  readonly cloneUrl: string;
  readonly repositorySlug: string;
  readonly headBranch: string;
  readonly baseBranch: string;
  readonly headCommitHash: string;
}
