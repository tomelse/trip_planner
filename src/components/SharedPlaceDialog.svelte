<script lang="ts">
  import { store } from '../lib/store.svelte'
  import { search, type SearchResult } from '../lib/geo'

  let dlg: HTMLDialogElement | undefined = $state()
  let query = $state('')
  let results = $state<SearchResult[]>([])
  let busy = $state(false)
  let searched = $state(false)
  let failed = $state(false)
  let tripId = $state<number | null>(null)
  // Guards against a slow search finishing after the dialog moved on.
  let run = 0

  const shared = $derived(store.shared)

  async function runSearch(q: string, fallback?: string) {
    const mine = ++run
    busy = true
    searched = false
    failed = false
    let found: SearchResult[] = []
    try {
      found = await search(q)
      if (!found.length && fallback && fallback !== q) found = await search(fallback)
    } catch {
      failed = true
    }
    if (mine !== run) return
    results = found
    busy = false
    searched = true
  }

  // Open the dialog when something is shared in, and look the place up.
  $effect(() => {
    if (!dlg) return
    if (shared && !dlg.open) {
      query = shared.query || shared.name
      results = []
      searched = false
      tripId = store.current?.trip.id ?? store.trips[0]?.id ?? null
      dlg.showModal()
      // A link with coordinates is exact; otherwise ask the geocoder for candidates.
      if (!shared.coords) runSearch(shared.query || shared.name, shared.name)
    } else if (!shared && dlg.open) {
      run++
      dlg.close()
    }
  })

  const hasTrip = $derived(tripId !== null)

  async function add(lat: number, lng: number, name?: string, address?: string) {
    if (tripId === null) return
    if (tripId !== store.current?.trip.id) await store.openTrip(tripId)
    await store.addPlace(lat, lng, name, address)
    store.shared = null
  }

  function submit(e: SubmitEvent) {
    e.preventDefault()
    if (query.trim()) runSearch(query.trim())
  }
</script>

<dialog bind:this={dlg} onclose={() => (store.shared = null)} aria-labelledby="share-title">
  <div class="content">
    <h2 id="share-title">Add shared place</h2>
    {#if shared}
      <p class="what">{shared.name || 'Shared location'}</p>

      {#if !store.trips.length}
        <p>Create a trip first, then this place can be added to it.</p>
        <div class="buttons">
          <button onclick={() => (store.shared = null)}>Cancel</button>
          <button class="primary" onclick={() => (store.tripDialog = 'new')}>New trip…</button>
        </div>
      {:else}
        {#if store.trips.length > 1}
          <label class="field">Add to
            <select bind:value={tripId}>
              {#each store.trips as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
            </select>
          </label>
        {:else}
          <p class="muted">Adding to <strong>{store.trips[0].name}</strong></p>
        {/if}

        {#if shared.coords}
          <div class="results">
            <button class="row" disabled={!hasTrip} onclick={() => add(shared.coords![0], shared.coords![1], shared.name || undefined)}>
              <strong>{shared.name || 'Location from the link'}</strong>
              <small>{shared.coords[0].toFixed(5)}, {shared.coords[1].toFixed(5)}</small>
            </button>
          </div>
        {/if}

        <form class="find" onsubmit={submit}>
          <input bind:value={query} placeholder="Search for the place" aria-label="Search for the place" />
          <button disabled={busy || !query.trim()}>{busy ? '…' : 'Search'}</button>
        </form>

        {#if results.length}
          <div class="results">
            {#each results as r}
              <button class="row" disabled={!hasTrip} onclick={() => add(r.lat, r.lng, r.name, r.address)}>
                <strong>{r.name}</strong>
                <small>{r.detail}</small>
              </button>
            {/each}
          </div>
        {:else if searched}
          <p class="muted">{failed ? 'Could not reach the search service. Try again in a moment.' : 'No matches. Try a fuller name or address.'}</p>
        {/if}

        <div class="buttons"><button onclick={() => (store.shared = null)}>Cancel</button></div>
      {/if}
    {/if}
  </div>
</dialog>

<style>
  p { margin: 0; }
  .what { font-weight: 600; overflow-wrap: anywhere; }
  .muted { color: var(--ink-2); font-size: 13px; }
  .find { display: flex; gap: 6px; }
  .results { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--radius); padding: 2px; }
  .row { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; width: 100%; border: none; text-align: left; }
  .row small { color: var(--ink-2); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  .buttons { display: flex; justify-content: flex-end; gap: 8px; }
</style>
