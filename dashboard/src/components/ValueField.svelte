<script lang="ts">
  import { fieldSpec } from "../lib/fields";
  import { t } from "../lib/i18n.svelte";
  import { fieldLabel } from "../lib/ui";

  let {
    name,
    value = $bindable(),
    inherit = $bindable(undefined),
  }: {
    name: string;
    value: string;
    /** Repository scope only. `undefined` renders no inherit control. */
    inherit?: boolean | undefined;
  } = $props();

  let spec = $derived(fieldSpec(name));
  let id = $derived(`field-${name}`);
  let disabled = $derived(inherit === true);
</script>

<div class={["grid content-start gap-1.25", spec.kind === "textarea" && "col-span-full"]}>
  <div class="flex items-baseline justify-between gap-2.5">
    <label for={id} class={fieldLabel}>
      {t(spec.label)}
      {#if spec.hint}<span class="text-fg-dim">({t(spec.hint)})</span>{/if}
    </label>
    {#if inherit !== undefined}
      <label
        class="flex items-center gap-1.25 text-xs font-medium whitespace-nowrap text-fg-dim"
      >
        <input type="checkbox" class="m-0 w-auto" bind:checked={inherit} />
        {t("field.inherit")}
      </label>
    {/if}
  </div>

  {#if spec.kind === "select"}
    <select {id} bind:value {disabled}>
      {#each spec.options as option (option)}
        <option value={option}>{option === "" ? t("field.unset") : option}</option>
      {/each}
    </select>
  {:else if spec.kind === "integer"}
    <input
      {id}
      type="number"
      min={spec.min}
      max={spec.max}
      step="1"
      required
      bind:value
      {disabled}
    />
    <span class="text-2xs text-fg-dim">{spec.min} – {spec.max}</span>
  {:else if spec.kind === "textarea"}
    <textarea {id} maxlength={spec.maxLength} bind:value {disabled}></textarea>
    <span class="text-2xs text-fg-dim">
      {t("field.chars", { length: value.length, max: spec.maxLength })}
    </span>
  {:else}
    <input
      {id}
      type={spec.kind === "url" ? "url" : "text"}
      maxlength={spec.maxLength}
      pattern={spec.pattern}
      bind:value
      {disabled}
    />
  {/if}
</div>
