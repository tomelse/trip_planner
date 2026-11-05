<script lang="ts">
  import { store } from '../lib/store.svelte'

  let creating = $state(false)
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
  </div>

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
  .title { border-color: transparent; padding: 2px 0; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
  .title:hover { border-bottom-color: var(--line); border-radius: 0; }
  .dates { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .del { align-self: flex-start; padding: 0; font-size: 12px; }
</style>
