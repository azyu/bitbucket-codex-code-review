/** Bitbucket API 응답/요청 인터페이스 */
export interface IBitbucketComment {
  readonly id: number;
  readonly content: {
    readonly raw: string;
  };
  // 아래 필드는 listComments 결과에서만 읽는다.
  readonly parent?: { readonly id: number };
  readonly inline?: {
    readonly path: string;
    readonly to?: number | null;
    readonly from?: number | null;
  };
  readonly user?: { readonly uuid?: string; readonly display_name?: string };
  readonly deleted?: boolean;
}

export interface IListCommentsParams {
  readonly workspace: string;
  readonly repoSlug: string;
  readonly pullRequestId: number;
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
}
