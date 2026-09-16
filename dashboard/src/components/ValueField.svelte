<script lang="ts">
  import { fieldSpec } from "../lib/fields";

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

<div class="field" class:wide={spec.kind === "textarea"}>
  <div class="head">
    <label for={id}>
      {spec.label}
      {#if spec.hint}<span class="dim">({spec.hint})</span>{/if}
    </label>
    {#if inherit !== undefined}
      <label class="inherit">
        <input type="checkbox" bind:checked={inherit} />
        inherit
      </label>
    {/if}
  </div>

  {#if spec.kind === "select"}
    <select {id} bind:value {disabled}>
      {#each spec.options as option (option)}
        <option value={option}>{option === "" ? "(unset)" : option}</option>
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
    <span class="dim bounds">{spec.min} – {spec.max}</span>
  {:else if spec.kind === "textarea"}
    <textarea {id} maxlength={spec.maxLength} bind:value {disabled}></textarea>
    <span class="dim bounds">
      {value.length} / {spec.maxLength} characters
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

<style>
  .field {
    display: grid;
    gap: 5px;
    align-content: start;
  }

  .wide {
    grid-column: 1 / -1;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-dim);
  }

  .inherit {
    display: flex;
    align-items: center;
    gap: 5px;
    font-weight: 500;
    white-space: nowrap;
  }

  .inherit input {
    width: auto;
    margin: 0;
  }

  .bounds {
    font-size: 11px;
  }
</style>
