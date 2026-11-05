<script lang="ts">
  import { store } from '../lib/store.svelte'

  let open = $state(false)
  const issues = $derived(store.issues)
  const errors = $derived(issues.filter((i) => i.level === 'error').length)
</script>

{#if issues.length}
  <div class="issues">
    <button class="sum" aria-expanded={open} onclick={() => (open = !open)}>
      <span class="dot" class:err={errors > 0}></span>
      {issues.length} timing {issues.length === 1 ? 'issue' : 'issues'}
      <span class="chev">{open ? '−' : '+'}</span>
    </button>
    {#if open}
      <ul>
        {#each issues as i (i.id)}
          <li><button class:err={i.level === 'error'} onclick={() => store.focus.select(i.ref)}>{i.message}</button></li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .issues { margin: 0 12px 10px; border: 1px solid var(--line); border-radius: var(--radius); }
  .sum { display: flex; align-items: center; gap: 8px; width: 100%; border: none; text-align: left; padding: 6px 10px; color: var(--ink-2); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--warn); }
  .dot.err { background: var(--danger); }
  .chev { margin-left: auto; color: var(--ink-3); }
  ul { list-style: none; margin: 0; padding: 0 4px 4px; max-height: 160px; overflow-y: auto; }
  li button { width: 100%; border: none; text-align: left; font-size: 12px; padding: 4px 6px; color: var(--warn); }
  li button.err { color: var(--danger); }
</style>
