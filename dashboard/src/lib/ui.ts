/**
 * Utility strings shared by more than one component. Tailwind finds classes
 * by scanning source text, so every class name must appear whole — joining
 * complete names is fine, assembling one from fragments (`bg-${tone}`) is not.
 */

export const primaryButton =
  "border-accent bg-accent text-accent-contrast hover:bg-accent hover:brightness-108";

/** A button that reads as a link: no chrome, accent text. */
export const linkButton =
  "border-none bg-transparent p-0 font-semibold text-accent hover:bg-transparent hover:underline";

export const fieldLabel = "text-xs font-semibold text-fg-dim";

export type Tone = "ok" | "warn" | "bad" | "mute";

export const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  mute: "bg-mute-bg text-mute",
};
