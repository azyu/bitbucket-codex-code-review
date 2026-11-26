import { type IBitbucketComment } from "../bitbucket/interfaces/bitbucket.interfaces";
import { formatInlineComment } from "./review.formatter";
import { selectPreviousFindings } from "./review.rereview";
import { type IReviewItem } from "./review.types";

const BOT = "{bot}";
const AUTHOR = "{author}";

const item = (overrides: Partial<IReviewItem> = {}): IReviewItem => ({
  title: "Guard null",
  path: "src/app.ts",
  lineRange: { start: 10, end: 12 },
  severity: "blocking",
  description: "desc",
  reason: "reason",
  ...overrides,
});

const comment = (
  id: number,
  uuid: string,
  raw: string,
  extra: Partial<IBitbucketComment> = {},
): IBitbucketComment => ({ id, user: { uuid }, content: { raw }, ...extra });

describe("selectPreviousFindings", () => {
  const finding = item();
  const paths = new Set(["src/app.ts"]);
  // 실제 게시 본문으로 짝짓기를 확인한다 — 서식이 바뀌면 이 테스트가 먼저 깨져야 한다.
  const thread: IBitbucketComment[] = [
    comment(100, BOT, "## 📋 코드 리뷰"),
    // 사람이 봇 서식을 흉내 낸 인라인 댓글은 스레드가 아니다
    comment(101, AUTHOR, formatInlineComment(finding), {
      inline: { path: "src/app.ts", to: 12 },
    }),
    comment(102, BOT, formatInlineComment(finding), {
      inline: { path: "src/app.ts", to: 12 },
    }),
    comment(103, AUTHOR, "고쳤어요", { parent: { id: 102 } }),
    comment(104, BOT, "봇 답글", { parent: { id: 103 } }),
    comment(105, "{reviewer}", "중첩 답글", { parent: { id: 104 } }),
    comment(106, AUTHOR, "지운 답글", { parent: { id: 102 }, deleted: true }),
    comment(107, AUTHOR, "다른 사람 스레드 답글", { parent: { id: 101 } }),
  ];

  it("attaches non-bot replies from the whole bot thread in id order", () => {
    expect(selectPreviousFindings([finding], paths, thread, "100")).toEqual([
      { item: finding, replies: ["고쳤어요", "중첩 답글"] },
    ]);
  });

  it("attaches no replies when the summary comment is unknown", () => {
    expect(selectPreviousFindings([finding], paths, thread, null)).toEqual([
      { item: finding, replies: [] },
    ]);
    expect(selectPreviousFindings([finding], paths, thread, 999)).toEqual([
      { item: finding, replies: [] },
    ]);
  });

  it("ignores bot inline comments from an earlier run", () => {
    expect(selectPreviousFindings([finding], paths, thread, 102)[0].replies).toEqual([]);
  });

  it("drops findings outside the current diff paths", () => {
    expect(
      selectPreviousFindings([item({ path: "src/gone.ts" })], paths, thread, 100),
    ).toEqual([]);
  });

  it("claims each root once and prefers the one at the posted line", () => {
    const same = item({ lineRange: { start: 20, end: 20 } });
    const comments = [
      comment(100, BOT, "summary"),
      comment(201, BOT, formatInlineComment(finding), { inline: { path: "src/app.ts", to: 12 } }),
      comment(202, BOT, formatInlineComment(same), { inline: { path: "src/app.ts", to: 20 } }),
      comment(203, AUTHOR, "at 12", { parent: { id: 201 } }),
      comment(204, AUTHOR, "at 20", { parent: { id: 202 } }),
    ];

    const result = selectPreviousFindings([same, finding], paths, comments, 100);

    expect(result.map((entry) => entry.replies)).toEqual([["at 20"], ["at 12"]]);
  });

  it("does not give one thread to two identical findings", () => {
    const result = selectPreviousFindings([finding, finding], paths, thread, 100);

    expect(result.map((entry) => entry.replies)).toEqual([
      ["고쳤어요", "중첩 답글"],
      [],
    ]);
  });

  it("does not let a title equal to a severity label take another finding's thread", () => {
    // 제목이 "Blocking"이면 다른 지적 본문 첫 줄의 `🚫 **Blocking**`에도 들어맞는다.
    const labelTitled = item({ title: "Blocking", severity: "recommended" });
    const real = item({ title: "Real bug" });
    const comments = [
      comment(100, BOT, "summary"),
      comment(201, BOT, formatInlineComment(real), { inline: { path: "src/app.ts", to: 12 } }),
      comment(202, BOT, formatInlineComment(labelTitled), { inline: { path: "src/app.ts", to: 12 } }),
      comment(203, AUTHOR, "reply to real", { parent: { id: 201 } }),
      comment(204, AUTHOR, "reply to label", { parent: { id: 202 } }),
    ];

    const result = selectPreviousFindings([labelTitled, real], paths, comments, 100);

    expect(result.map((entry) => entry.replies)).toEqual([
      ["reply to label"],
      ["reply to real"],
    ]);
  });

  it("caps findings, replies and text length", () => {
    const items = Array.from({ length: 25 }, (_, index) =>
      item({ title: `t${index}`, description: "d".repeat(3000) }),
    );
    const comments = [
      comment(100, BOT, "summary"),
      comment(101, BOT, formatInlineComment(items[0]), { inline: { path: "src/app.ts", to: 12 } }),
      ...Array.from({ length: 7 }, (_, index) =>
        comment(110 + index, AUTHOR, `${index}`.repeat(3000), { parent: { id: 101 } }),
      ),
    ];

    const result = selectPreviousFindings(items, paths, comments, 100);

    expect(result).toHaveLength(20);
    expect(result[0].item.description).toHaveLength(2001);
    expect(result[0].replies).toHaveLength(5);
    expect(result[0].replies[0]).toBe(`${"0".repeat(2000)}…`);
  });
});
