<script lang="ts">
  import { store } from '../lib/store.svelte'
  import DataMenu from './DataMenu.svelte'

  let creating = $state(false)
  let showData = $state(false)
  let name = $state('')

  async function create(e: SubmitEvent) {
    e.preventDefault()
    await store.createTrip(name)
    name = ''
    creating = false
  }

  async function remove() {
    if (store.current) await store.deleteTrip()
  }
</script>

<header>
  <div class="row">
    {#if creating || store.trips.length === 0}
      <form onsubmit={create}>
        <!-- svelte-ignore a11y_autofocus -->
        <input placeholder="Trip name" bind:value={name} autofocus />
        <button class="primary">Add</button>
        {#if store.trips.length}<button type="button" class="ghost" onclick={() => (creating = false)}>Cancel</button>{/if}
      </form>
    {:else}
      <select
        value={store.current?.trip.id}
        onchange={(e) => store.openTrip(Number(e.currentTarget.value))}
      >
        {#each store.trips as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
      </select>
      <button onclick={() => (creating = true)} title="New trip">+ New</button>
    {/if}
    <button class="ghost more" class:on={showData} onclick={() => (showData = !showData)} aria-expanded={showData} aria-label="Backup and import" title="Backup and import">⋯</button>
  </div>
  {#if showData}<DataMenu />{/if}

  {#if store.current && !creating}
    {@const trip = store.current.trip}
    <input class="title" value={trip.name} oninput={(e) => store.patchTrip({ name: e.currentTarget.value })} aria-label="Trip name" />
    <div class="dates">
      <label class="field">From
        <input type="date" value={trip.start_date ?? ''} oninput={(e) => store.patchTrip({ start_date: e.currentTarget.value || null })} />
      </label>
      <label class="field">To
        <input type="date" value={trip.end_date ?? ''} oninput={(e) => store.patchTrip({ end_date: e.currentTarget.value || null })} />
      </label>
    </div>
    <button class="ghost danger del" onclick={remove}>Delete trip</button>
  {/if}
</header>

<style>
  header { padding: 14px 12px 8px; display: flex; flex-direction: column; gap: 10px; position: relative; }
  .row, form { display: flex; gap: 6px; }
  .row form { flex: 1; min-width: 0; }
  .more { padding: 0 10px; font-size: 18px; line-height: 1; }
  .more.on { color: var(--ink); background: var(--hover); }
  .title { border-color: transparent; padding: 2px 0; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
  .title:hover { border-bottom-color: var(--line); border-radius: 0; }
  .dates { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .del { align-self: flex-start; padding: 0; font-size: 12px; }
</style>
