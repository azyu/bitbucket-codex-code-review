/** 웹훅 이벤트에서 추출한 PR 정보 */
export interface IWebhookPrPayload {
  readonly repositorySlug: string;
  readonly workspaceSlug: string;
  readonly pullRequestId: number;
  readonly headCommitHash: string;
  readonly baseCommitHash: string;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly cloneUrl: string;
}

/** 댓글 웹훅 페이로드 (Bitbucket pullrequest:comment_created) */
export interface IBitbucketCommentWebhook {
  readonly comment: {
    readonly id: number;
    readonly content: {
      readonly raw: string;
    };
    readonly user: {
      readonly uuid: string;
      readonly display_name: string;
    };
  };
  readonly pullrequest: {
    readonly id: number;
    readonly title: string;
    readonly source: {
      readonly branch: { readonly name: string };
      readonly commit: { readonly hash: string };
      readonly repository: {
        readonly full_name: string;
      };
    };
    readonly destination: {
      readonly branch: { readonly name: string };
      readonly commit: { readonly hash: string };
    };
  };
  readonly repository: {
    readonly slug?: string;
    readonly full_name: string;
    readonly links: {
      readonly clone?: ReadonlyArray<{
        readonly href: string;
        readonly name: string;
      }>;
      readonly html?: {
        readonly href: string;
      };
    };
    readonly workspace: {
      readonly slug: string;
    };
  };
}
