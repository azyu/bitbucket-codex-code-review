import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../lib/i18n.svelte";
import { ReviewRunStatus } from "../../../src/review/review.types";
import StatusBadge from "./StatusBadge.svelte";

/**
 * The badge sits under a translated "상태" header, so a verbatim enum leaves
 * the primary table half English. An unmapped value is the exception: it stays
 * as itself, because that is what matches a log line.
 */
describe("StatusBadge", () => {
  let target: HTMLElement;
  let app: Record<string, unknown> | null = null;

  function render(status: string) {
    target = document.createElement("div");
    document.body.append(target);
    app = mount(StatusBadge, { target, props: { status } }) as Record<string, unknown>;
    return target.querySelector(".badge")?.textContent?.trim() ?? "";
  }

  afterEach(() => {
    if (app !== null) unmount(app);
    app = null;
    target.remove();
    setLocale("ko");
  });

  it("translates every declared status", () => {
    for (const [status, korean] of [
      [ReviewRunStatus.COMPLETED, "완료"],
      [ReviewRunStatus.FAILED, "실패"],
      [ReviewRunStatus.SUPERSEDED, "대체됨"],
      [ReviewRunStatus.QUEUED, "대기 중"],
    ] as const) {
      expect(render(status)).toBe(korean);
      unmount(app!);
      app = null;
      target.remove();
    }

    expect(render(ReviewRunStatus.REVIEWING)).toBe("리뷰 중");
  });

  it("shows a status it has no mapping for as itself", () => {
    expect(render("quarantined")).toBe("quarantined");
  });
});
