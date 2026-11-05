<script lang="ts">
  import { store } from '../lib/store.svelte'

  let { placeId = null, title = 'Checklist', editable = true }: { placeId?: number | null; title?: string; editable?: boolean } = $props()

  const items = $derived((store.current?.items ?? []).filter((i) => i.place_id === placeId))
  const done = $derived(items.filter((i) => i.done).length)
  let text = $state('')

  function add(e: SubmitEvent) {
    e.preventDefault()
    store.addItem(placeId, text)
    text = ''
  }
</script>

{#if editable || items.length}
  <div class="list">
    <div class="head">
      <span>{title}</span>
      {#if items.length}<small>{done}/{items.length}</small>{/if}
    </div>
    {#each items as i (i.id)}
      <div class="item" class:done={i.done}>
        <input type="checkbox" checked={!!i.done} onchange={(e) => store.patchItem(i.id, { done: e.currentTarget.checked ? 1 : 0 })} aria-label="Done" />
        {#if editable}
          <input class="text" value={i.text} oninput={(e) => store.patchItem(i.id, { text: e.currentTarget.value })} aria-label="Item" />
          <button class="ghost" onclick={() => store.deleteItem(i.id)} aria-label="Remove item" title="Remove">×</button>
        {:else}
          <span class="label">{i.text}</span>
        {/if}
      </div>
    {/each}
    {#if editable}
      <form onsubmit={add}>
        <input placeholder="Add an item…" bind:value={text} aria-label="New checklist item" />
      </form>
    {/if}
  </div>
{/if}

<style>
  .list { display: flex; flex-direction: column; gap: 2px; }
  .head { display: flex; justify-content: space-between; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 2px; }
  .item { display: flex; align-items: center; gap: 8px; }
  .text { border-color: transparent; padding: 3px 4px; }
  .text:hover { border-color: var(--line); }
  .done .text { text-decoration: line-through; color: var(--ink-3); }
  .label { padding: 3px 4px; }
  .done .label { text-decoration: line-through; color: var(--ink-3); }
  .item button { padding: 0 8px; min-height: 0; font-size: 16px; line-height: 1.2; }
  form { margin-top: 2px; }
  input[type='checkbox'] { accent-color: var(--accent); flex: none; margin: 0; }
</style>
