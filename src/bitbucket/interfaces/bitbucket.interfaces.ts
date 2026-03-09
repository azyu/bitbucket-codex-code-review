/** Bitbucket API 응답/요청 인터페이스 */
export interface IBitbucketComment {
  readonly id: number;
  readonly content: {
    readonly raw: string;
  };
}

export interface ICreateCommentParams {
  readonly workspace: string;
  readonly repoSlug: string;
  readonly pullRequestId: number;
  readonly body: string;
}

export interface ICreateInlineCommentParams extends ICreateCommentParams {
  readonly filePath: string;
  readonly line: number;
  readonly endLine?: number;
}
