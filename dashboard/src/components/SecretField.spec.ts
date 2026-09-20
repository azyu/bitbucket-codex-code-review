import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../lib/i18n.svelte";
import SecretField from "./SecretField.svelte";

/**
 * The status line is the one place a server enum reaches translated text. A
 * template that interpolates `source` renders "repository에 설정됨" in the
 * default locale, so the guard is that no implementation value survives into
 * the label.
 */
describe("SecretField status", () => {
  let target: HTMLElement;
  let app: Record<string, unknown> | null = null;

  function render(status: { configured: boolean; source: string } | undefined) {
    target = document.createElement("div");
    document.body.append(target);
    app = mount(SecretField, {
      target,
      props: {
        name: "bitbucketApiToken",
        status,
        draft: { operation: "keep" as const, value: "" },
      },
    }) as Record<string, unknown>;
    return target.querySelector(".tag")?.textContent?.trim() ?? "";
  }

  afterEach(() => {
    if (app !== null) unmount(app);
    app = null;
    target.remove();
    setLocale("ko");
  });

  it("names a locally stored repository secret without leaking the enum", () => {
    const label = render({ configured: true, source: "repository" });

    expect(label).toBe("이 저장소에 설정됨");
    expect(label).not.toContain("repository");
  });

  it("keeps the other statuses in the active locale too", () => {
    expect(render({ configured: true, source: "global" })).toBe("전역에서 상속");
    unmount(app!);
    app = null;
    target.remove();

    expect(render({ configured: false, source: "unconfigured" })).toBe("설정 안 됨");
  });
});
