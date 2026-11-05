<script lang="ts">
  import { search, type SearchResult } from '../lib/geo'

  let { onpick }: { onpick: (r: SearchResult) => void } = $props()

  let q = $state('')
  let results = $state<SearchResult[]>([])
  let busy = $state(false)
  let searched = $state(false)

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (!q.trim()) return
    busy = true
    results = await search(q.trim()).catch(() => [])
    searched = true
    busy = false
  }

  function pick(r: SearchResult) {
    onpick(r)
    results = []
    searched = false
    q = ''
  }
</script>

<div class="search">
  <form onsubmit={submit}>
    <input placeholder="Search for a place…" bind:value={q} oninput={() => (searched = false)} />
    {#if busy}<span class="busy">…</span>{/if}
  </form>
  {#if results.length}
    <ul>
      {#each results as r}
        <li><button onclick={() => pick(r)}><strong>{r.name}</strong><small>{r.detail}</small></button></li>
      {/each}
    </ul>
  {:else if searched}
    <p>No results.</p>
  {/if}
</div>

<style>
  .search { position: relative; width: 300px; max-width: 100%; flex: 1 1 200px; }
  form input { background: var(--panel); padding: 8px 10px; }
  .busy { position: absolute; right: 10px; top: 8px; color: var(--ink-3); }
  ul, p {
    position: absolute; left: 0; right: 0; top: 40px; margin: 0; padding: 4px; list-style: none;
    background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  }
  p { padding: 8px 10px; color: var(--ink-2); }
  li button { display: flex; flex-direction: column; width: 100%; text-align: left; border: none; gap: 1px; }
  small { color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
