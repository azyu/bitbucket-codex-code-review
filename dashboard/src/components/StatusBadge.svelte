<script lang="ts">
  import { ReviewRunStatus } from "../../../src/review/review.types";

  let { status }: { status: string } = $props();

  const TONE: Record<string, "ok" | "warn" | "bad" | "mute"> = {
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

<span class="badge" data-tone={tone}>{status}</span>

<style>
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
  }

  .badge[data-tone="ok"] {
    color: var(--ok);
    background: var(--ok-bg);
  }

  .badge[data-tone="warn"] {
    color: var(--warn);
    background: var(--warn-bg);
  }

  .badge[data-tone="bad"] {
    color: var(--bad);
    background: var(--bad-bg);
  }

  .badge[data-tone="mute"] {
    color: var(--mute);
    background: var(--mute-bg);
  }
</style>
