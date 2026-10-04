<script lang="ts">
  import { tEnum } from "../lib/i18n.svelte";
  import { ReviewRunStatus } from "../../../src/review/review.types";
  import { TONE_CLASS, type Tone } from "../lib/ui";

  let { status }: { status: string } = $props();

  type Icon = "ok" | "bad" | "skip" | "wait" | "spin";

  // Each state also gets a shape, so the badge does not rely on colour alone.
  const LOOK: Record<string, [Tone, Icon]> = {
    [ReviewRunStatus.COMPLETED]: ["ok", "ok"],
    [ReviewRunStatus.FAILED]: ["bad", "bad"],
    [ReviewRunStatus.SUPERSEDED]: ["mute", "skip"],
    [ReviewRunStatus.QUEUED]: ["run", "wait"],
    [ReviewRunStatus.PREPARING]: ["run", "spin"],
    [ReviewRunStatus.REVIEWING]: ["run", "spin"],
    [ReviewRunStatus.PUBLISHING]: ["run", "spin"],
  };

  let look = $derived(LOOK[status]);
</script>

<span
  class={[
    "badge inline-flex items-center gap-1 rounded-full py-0.5 pr-2 pl-1.5 text-xs font-medium whitespace-nowrap",
    TONE_CLASS[look?.[0] ?? "mute"],
  ]}
>
  {#if look !== undefined}
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      class={[
        "size-3.25 shrink-0 fill-none stroke-current stroke-[2.2]",
        look[1] === "spin" && "motion-safe:animate-spin",
      ]}
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {#if look[1] === "ok"}<path d="M3.5 8.5l3 3 6-7" />
      {:else if look[1] === "bad"}<path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
      {:else if look[1] === "skip"}<path d="M3 8h8M8.5 5l3 3-3 3M13 4v8" />
      {:else if look[1] === "wait"}<circle cx="8" cy="8" r="5.5" /><path d="M8 5v3l2 1.5" />
      {:else}<path d="M8 2.5a5.5 5.5 0 1 1-5.5 5.5" />{/if}
    </svg>
  {/if}{tEnum("status", status)}</span
>
