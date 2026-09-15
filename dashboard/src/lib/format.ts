const DECIMAL = new Intl.NumberFormat("en-US");

export function count(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : DECIMAL.format(value);
}

/** Compact durations: ops readers compare orders of magnitude, not milliseconds. */
export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function tokens(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return "—";
  if (value < 10_000) return DECIMAL.format(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(2)}M`;
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
  return `${Math.round((part / whole) * 100)}%`;
}
