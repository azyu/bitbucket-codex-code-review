const DECIMAL = new Intl.NumberFormat("en-US");

export function count(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : DECIMAL.format(value);
}

/** Compact durations: ops readers compare orders of magnitude, not milliseconds. */
export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  // Rounded from the total, not from the remainder: rounding the remainder
  // turns 119_999ms into "1m 60s" instead of "2m 00s".
  if (ms < 3_600_000) {
    const total = Math.round(ms / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  // The overview sums whole windows, so the minute band runs off the end:
  // a week of reviews reads as "4653m 34s". Same carry rule one band up.
  const total = Math.round(ms / 60_000);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function tokens(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return "—";
  if (value < 10_000) return DECIMAL.format(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  return `${(value / 1_000_000_000).toFixed(2)}B`;
}

export function absoluteTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleString("sv-SE").replace("T", " ");
}

export function relativeTime(
  iso: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!iso) return "—";
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return "—";
  const seconds = Math.round((now - at) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 8) : "—";
}

export function percent(part: number, whole: number): string {
  if (whole <= 0) return "—";
  const exact = (part / whole) * 100;
  // 1601 completed of 1608 is not "100%". Rounding hides every failure rate
  // below 1-in-200, which is exactly the range this dashboard is watched for,
  // so an incomplete ratio floors to a tenth — floor, not round, because
  // rounding the extra digit would close the gap again at 99.97%.
  if (part < whole && Math.round(exact) === 100) {
    return `${(Math.floor(exact * 10) / 10).toFixed(1)}%`;
  }
  return `${Math.round(exact)}%`;
}
