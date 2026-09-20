import { afterEach, describe, expect, it } from "vitest";
import {
  absoluteTime,
  count,
  duration,
  percent,
  relativeTime,
  shortSha,
  tokens,
} from "./format";
import { setLocale } from "./i18n.svelte";

// These read as trivial, but every one of them has a unit boundary that flips
// the displayed magnitude. A wrong boundary makes a 59-second review read as
// "1m 00s" or a 999-token run read as "1.0k", which is the kind of thing an
// operator compares across repositories.

describe("duration", () => {
  it("renders an em dash for absent and non-positive values", () => {
    expect(duration(null)).toBe("—");
    expect(duration(undefined)).toBe("—");
    expect(duration(0)).toBe("—");
    expect(duration(-5)).toBe("—");
  });

  it("switches unit exactly at 1s and 1m", () => {
    expect(duration(999)).toBe("999ms");
    expect(duration(1000)).toBe("1.0s");
    expect(duration(59_999)).toBe("60.0s");
    expect(duration(60_000)).toBe("1m 00s");
    expect(duration(61_500)).toBe("1m 02s");
    expect(duration(3_600_000)).toBe("1h 00m");
  });

  it("zero-pads the seconds so minute values stay column-aligned", () => {
    expect(duration(120_000)).toBe("2m 00s");
    expect(duration(125_000)).toBe("2m 05s");
  });
});

describe("tokens", () => {
  it("treats zero as no data", () => {
    expect(tokens(0)).toBe("—");
    expect(tokens(null)).toBe("—");
  });

  it("switches unit exactly at 10k and 1M", () => {
    expect(tokens(9999)).toBe("9,999");
    expect(tokens(10_000)).toBe("10.0k");
    expect(tokens(999_999)).toBe("1000.0k");
    expect(tokens(1_000_000)).toBe("1.00M");
    expect(tokens(2_500_000)).toBe("2.50M");
  });
});

describe("count", () => {
  it("keeps zero, unlike tokens — zero runs is a fact, not missing data", () => {
    expect(count(0)).toBe("0");
    expect(count(1234)).toBe("1,234");
    expect(count(null)).toBe("—");
  });
});

describe("percent", () => {
  it("guards division by zero rather than rendering NaN", () => {
    expect(percent(0, 0)).toBe("—");
    expect(percent(5, 0)).toBe("—");
    expect(percent(3, 5)).toBe("60%");
    expect(percent(1, 3)).toBe("33%");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-09-15T12:00:00.000Z");

  afterEach(() => setLocale("ko"));

  it("switches unit at a minute, an hour and a day", () => {
    expect(relativeTime("2026-09-15T11:59:30.000Z", now)).toBe("방금 전");
    expect(relativeTime("2026-09-15T11:59:00.000Z", now)).toBe("1분 전");
    expect(relativeTime("2026-09-15T11:00:00.000Z", now)).toBe("1시간 전");
    expect(relativeTime("2026-09-14T12:00:00.000Z", now)).toBe("1일 전");
    expect(relativeTime("2026-08-15T12:00:00.000Z", now)).toBe("31일 전");
  });

  it("follows the active locale", () => {
    setLocale("en");

    expect(relativeTime("2026-09-15T11:59:30.000Z", now)).toBe("just now");
    expect(relativeTime("2026-09-15T11:00:00.000Z", now)).toBe("1h ago");
  });

  it("does not render Invalid Date", () => {
    expect(relativeTime(null, now)).toBe("—");
    expect(relativeTime("", now)).toBe("—");
    expect(relativeTime("not a date", now)).toBe("—");
  });
});

describe("absoluteTime", () => {
  it("does not render Invalid Date", () => {
    expect(absoluteTime(null)).toBe("—");
    expect(absoluteTime("")).toBe("—");
    expect(absoluteTime("not a date")).toBe("—");
  });

  it("renders a sortable date and time", () => {
    expect(absoluteTime("2026-09-15T12:00:00.000Z")).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    );
  });
});

describe("shortSha", () => {
  it("shortens to eight characters and handles absence", () => {
    expect(shortSha("5555555555555555555555555555555555555555")).toBe(
      "55555555",
    );
    expect(shortSha(null)).toBe("—");
    expect(shortSha("")).toBe("—");
  });
});

describe("duration carries rounded seconds into the minute", () => {
  it("never prints sixty seconds", () => {
    // Rounding the remainder rather than the total made this "1m 60s".
    expect(duration(119_999)).toBe("2m 00s");
    expect(duration(59_500 + 60_000)).toBe("2m 00s");
    expect(duration(89_400)).toBe("1m 29s");
    expect(duration(60_000)).toBe("1m 00s");
  });
});

describe("duration and tokens keep large ops figures readable", () => {
  it("rolls minutes into hours instead of printing 4653m", () => {
    // The overview's "Review time" tile sums every run in the window, which
    // is tens of hours once a repository has been reviewed for a week.
    expect(duration(279_214_000)).toBe("77h 34m");
    expect(duration(3_660_000)).toBe("1h 01m");
    expect(duration(3_599_000)).toBe("59m 59s");
  });

  it("zero-pads the minutes so hour values stay column-aligned", () => {
    expect(duration(7_200_000)).toBe("2h 00m");
    expect(duration(7_500_000)).toBe("2h 05m");
  });

  it("carries rounded minutes into the hour", () => {
    // Same trap as "1m 60s": rounding the remainder would print "1h 60m".
    expect(duration(7_199_000)).toBe("2h 00m");
  });

  it("switches to billions instead of printing 1222.59M", () => {
    expect(tokens(999_999_999)).toBe("1000.00M");
    expect(tokens(1_000_000_000)).toBe("1.00B");
    expect(tokens(1_222_590_000)).toBe("1.22B");
  });
});

describe("percent does not round a failure away", () => {
  it("keeps 100% for a genuinely complete ratio", () => {
    expect(percent(1608, 1608)).toBe("100%");
    expect(percent(0, 5)).toBe("0%");
  });

  it("drops to a tenth when rounding would claim 100%", () => {
    // 1601 of 1608 completed: six failures and a supersede read as "100%".
    expect(percent(1601, 1608)).toBe("99.5%");
    expect(percent(9999, 10_000)).toBe("99.9%");
  });
});
