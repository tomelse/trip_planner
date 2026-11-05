<script lang="ts">
  import { search, type SearchResult } from '../lib/geo'
  import type { LegMode } from '../lib/types'

  let { name, located, mode, label, onname, onpick, onclear }: {
    name: string
    located: boolean
    mode: LegMode
    label: string
    onname: (v: string) => void
    onpick: (r: SearchResult) => void
    onclear: () => void
  } = $props()

  let results = $state<SearchResult[]>([])
  let busy = $state(false)
  let searched = $state(false)

  async function find(e: SubmitEvent) {
    e.preventDefault()
    const q = name.trim()
    if (!q) return
    busy = true
    // Bare IATA codes ("LHR") don't geocode on their own.
    const query = mode === 'flight' && /^[a-z]{3}$/i.test(q) ? `${q} airport` : q
    results = await search(query).catch(() => [])
    searched = true
    busy = false
  }

  function pick(r: SearchResult) {
    onpick(r)
    results = []
    searched = false
  }
</script>

<form onsubmit={find}>
  <input
    placeholder={mode === 'flight' ? 'Airport, e.g. LHR' : 'Station or address'}
    value={name}
    oninput={(e) => { onname(e.currentTarget.value); searched = false }}
    aria-label={label}
  />
  <button disabled={busy || !name.trim()} title="Search the map for this location">{busy ? '…' : 'Locate'}</button>
</form>

{#if results.length}
  <ul>
    {#each results as r}
      <li><button type="button" onclick={() => pick(r)}><strong>{r.name}</strong><small>{r.detail}</small></button></li>
    {/each}
  </ul>
{:else if searched}
  <small class="note">No results — try a fuller name.</small>
{/if}

{#if located}
  <small class="note">Pinned on the map · <button type="button" class="link" onclick={onclear}>clear</button></small>
{/if}

<style>
  form { display: flex; gap: 4px; }
  ul { list-style: none; margin: 0; padding: 2px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
  li button { display: flex; flex-direction: column; width: 100%; text-align: left; border: none; gap: 1px; }
  li small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  small { color: var(--ink-2); font-size: 12px; }
  .note { color: var(--ink-3); }
  .link { border: none; padding: 0; background: none; color: var(--accent); font-size: 12px; }
  .link:hover { background: none; text-decoration: underline; }
</style>
