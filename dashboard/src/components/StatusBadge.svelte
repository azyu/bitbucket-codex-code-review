<script lang="ts">
  import { tEnum } from "../lib/i18n.svelte";
  import { ReviewRunStatus } from "../../../src/review/review.types";
  import { TONE_CLASS, type Tone } from "../lib/ui";

  let { status }: { status: string } = $props();

  const TONE: Record<string, Tone> = {
    [ReviewRunStatus.COMPLETED]: "ok",
    [ReviewRunStatus.FAILED]: "bad",
    [ReviewRunStatus.SUPERSEDED]: "mute",
    [ReviewRunStatus.QUEUED]: "warn",
    [ReviewRunStatus.PREPARING]: "warn",
    [ReviewRunStatus.REVIEWING]: "warn",
    [ReviewRunStatus.PUBLISHING]: "warn",
  };

  let tone = $derived(TONE[status] ?? "mute");
</script>

<span
  class={[
    "badge inline-block rounded-full px-2 py-0.5 text-[11.5px] font-semibold tracking-[0.01em] whitespace-nowrap",
    TONE_CLASS[tone],
  ]}>{tEnum("status", status)}</span
>
