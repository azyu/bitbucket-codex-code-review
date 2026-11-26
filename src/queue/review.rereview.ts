/** 재리뷰 컨텍스트 조립 — 직전 런의 지적과 그 인라인 스레드의 작성자 답글을 짝짓는다. I/O 없음. */
import { type IBitbucketComment } from "../bitbucket/interfaces/bitbucket.interfaces";
import { type IReviewItem } from "./review.types";

// 프롬프트 크기와 주입 면적을 묶어 두는 상한. 넘친 분량은 조용히 잘린다.
const MAX_PREVIOUS_FINDINGS = 20;
const MAX_REPLIES_PER_FINDING = 5;
const MAX_TEXT_CHARS = 2000;

export interface IPreviousFinding {
  readonly item: IReviewItem;
  readonly replies: ReadonlyArray<string>;
}

export interface IPreviousReviewContext {
  /** 직전 리뷰의 head를 푼 40자 SHA */
  readonly commitHash: string;
  readonly findings: ReadonlyArray<IPreviousFinding>;
  readonly incrementalDiff: string;
}

function truncate(text: string): string {
  return text.length > MAX_TEXT_CHARS
    ? `${text.slice(0, MAX_TEXT_CHARS)}…`
    : text;
}

/**
 * 직전 지적 중 현재 PR diff 경로에 남은 것만 골라 각 지적의 인라인 스레드 답글을 붙인다.
 * diff 밖 경로의 지적은 게시 단계에서 버려져 PR에 올라간 적이 없으므로 싣지 않는다.
 *
 * 스레드는 본문 문자열이 아니라 작성자로 가린다 — 사람이 봇 서식을 흉내 낸 인라인 댓글을
 * 스레드로 오인하면 그 사람의 글이 "직전 지적"의 맥락으로 실린다. 봇 계정은 요약 댓글
 * (resultCommentId)의 작성자로 확정하고, 그 댓글을 못 찾으면 답글을 하나도 붙이지 않는다.
 */
export function selectPreviousFindings(
  items: ReadonlyArray<IReviewItem>,
  changedPaths: ReadonlySet<string>,
  comments: ReadonlyArray<IBitbucketComment>,
  resultCommentId: number | string | null | undefined,
): IPreviousFinding[] {
  const selected = items
    .filter((item) => changedPaths.has(item.path))
    .slice(0, MAX_PREVIOUS_FINDINGS)
    .map((item) => ({ ...item, description: truncate(item.description) }));

  // bigint 컬럼은 문자열로 돌아온다.
  const summaryId =
    resultCommentId == null ? Number.NaN : Number(resultCommentId);
  const botUuid = comments.find((comment) => comment.id === summaryId)?.user
    ?.uuid;
  if (!botUuid) {
    return selected.map((item) => ({ item, replies: [] }));
  }

  const live = comments.filter((comment) => !comment.deleted);
  const childrenOf = new Map<number, IBitbucketComment[]>();
  for (const comment of live) {
    if (!comment.parent) continue;
    const siblings = childrenOf.get(comment.parent.id) ?? [];
    siblings.push(comment);
    childrenOf.set(comment.parent.id, siblings);
  }

  const claimed = new Set<number>();
  return selected.map((item) => {
    // 요약 댓글보다 뒤에 단 봇 인라인 댓글만 이번 런의 것이다. 같은 경로·제목이 둘이면
    // 게시 라인(lineRange.end)이 맞는 쪽, 그다음 먼저 단 쪽을 고른다.
    const root = live
      .filter(
        (comment) =>
          !comment.parent &&
          !claimed.has(comment.id) &&
          comment.id > summaryId &&
          comment.user?.uuid === botUuid &&
          comment.inline?.path === item.path &&
          item.title !== "" &&
          // formatInlineComment는 제목을 빈 줄로 둘러싼 한 줄에 둔다. 그냥 포함으로 보면
          // "Blocking" 같은 제목이 다른 지적 첫 줄의 `🚫 **Blocking**`에 들어맞는다.
          comment.content.raw.includes(`\n\n**${item.title}**\n\n`),
      )
      .sort(
        (a, b) =>
          Number(b.inline?.to === item.lineRange.end) -
            Number(a.inline?.to === item.lineRange.end) || a.id - b.id,
      )[0];
    if (!root) return { item, replies: [] };
    claimed.add(root.id);

    // 중첩 답글은 바로 위 댓글을 parent로 가리키므로 스레드 전체를 따라 내려간다.
    const descendants: IBitbucketComment[] = [];
    const queue = [...(childrenOf.get(root.id) ?? [])];
    while (queue.length > 0) {
      const comment = queue.shift()!;
      descendants.push(comment);
      queue.push(...(childrenOf.get(comment.id) ?? []));
    }
    const replies = descendants
      .filter((comment) => comment.user?.uuid !== botUuid)
      .sort((a, b) => a.id - b.id)
      .slice(0, MAX_REPLIES_PER_FINDING)
      .map((comment) => truncate(comment.content.raw));
    return { item, replies };
  });
}
