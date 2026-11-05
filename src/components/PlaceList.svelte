<script lang="ts">
  import { store } from '../lib/store.svelte'
  import { hoverable, revealRow } from '../lib/hoverable'
  import { fmtStay } from '../lib/dates'
  import { CATEGORIES, categoryLabel } from '../lib/categories'
  import { PALETTE } from '../lib/palette'
  import { search, type SearchResult } from '../lib/geo'
  import type { Place } from '../lib/types'
  import ChecklistEditor from './ChecklistEditor.svelte'
  import AttachmentList from './AttachmentList.svelte'
  import PlaceDetails from './PlaceDetails.svelte'

  let list: HTMLUListElement | undefined = $state()
  // Bring the open place into view, and the one being hovered on the map.
  $effect(() => revealRow(list, store.focus.selected?.type === 'place' ? store.focus.selected.id : null))
  $effect(() => revealRow(list, store.focus.mapHoverId('place')))

  let looking = $state<number | null>(null)
  /** What Look up found, shown for you to accept: it is the nearest building, which can be a neighbour. */
  let suggestion = $state<{ id: number; address: string } | null>(null)

  /** Matches for the address typed into a place: pick one to set the address and move the pin to it. */
  let finding = $state<number | null>(null)
  let found = $state<{ id: number; results: SearchResult[]; failed: boolean } | null>(null)

  async function findTyped(p: Place) {
    const q = p.address.trim()
    if (!q) return
    finding = p.id
    found = suggestion = null
    try {
      // Prefer matches near where the pin already is, so "17th St" means the one in this trip's city.
      const near: [number, number, number, number] = [p.lng - 0.3, p.lat - 0.3, p.lng + 0.3, p.lat + 0.3]
      found = { id: p.id, results: await search(q, near), failed: false }
    } catch {
      found = { id: p.id, results: [], failed: true }
    }
    finding = null
  }

  function useResult(p: Place, r: SearchResult) {
    store.patchPlace(p.id, { address: r.address, lat: r.lat, lng: r.lng })
    found = null
  }

  async function lookup(id: number) {
    looking = id
    suggestion = null
    found = null
    const nearest = await store.nearestAddress(id)
    looking = null
    const current = store.current?.places.find((p) => p.id === id)?.address.trim()
    if (nearest === null) store.notify('Could not look up an address for this pin.')
    else if (!current) store.patchPlace(id, { address: nearest }) // nothing to lose
    else if (nearest === current) store.notify('That already matches the map.')
    else suggestion = { id, address: nearest }
  }

  const places = $derived(store.current?.places ?? [])
  const filter = $derived(store.categoryFilter)
  const shown = $derived(filter ? places.filter((p) => p.category === filter) : places)
  const used = $derived(CATEGORIES.filter((c) => places.some((p) => p.category === c.id)))

  // Drag to reorder (mouse); the move buttons in each editor cover touch and keyboard.
  let dragId = $state<number | null>(null)
  let overId = $state<number | null>(null)

  function drop(targetId: number) {
    const to = places.findIndex((p) => p.id === targetId)
    if (dragId !== null && to >= 0) store.movePlace(dragId, to)
    dragId = overId = null
  }
</script>

{#if places.length === 0}
  <p class="empty">Click anywhere on the map, or search for a place, to pin your first location.</p>
{/if}

{#if used.length}
  <div class="chips">
    <button class:on={!filter} onclick={() => (store.categoryFilter = null)}>All</button>
    {#each used as c}
      <button class:on={filter === c.id} onclick={() => (store.categoryFilter = filter === c.id ? null : c.id)}>{c.label}</button>
    {/each}
  </div>
{/if}

<ul bind:this={list}>
  {#each shown as p, idx (p.id)}
    {@const ref = { type: 'place' as const, id: p.id }}
    {@const open = store.focus.isSelected(ref)}
    {@const warns = store.issuesFor('place', p.id)}
    <li
      class:open
      class:hl={store.focus.isHot(ref)}
      class:over={overId === p.id && dragId !== p.id}
      data-id={p.id}
      ondragover={(e) => {
        if (dragId === null) return
        e.preventDefault()
        overId = p.id
      }}
      ondrop={(e) => {
        e.preventDefault()
        drop(p.id)
      }}
    >
      <div class="row" role="presentation" use:hoverable={ref}>
        {#if !filter}
          <span
            class="grip"
            role="img"
            aria-label="Drag to reorder"
            title="Drag to reorder"
            draggable="true"
            ondragstart={(e) => {
              dragId = p.id
              e.dataTransfer?.setData('text/plain', String(p.id))
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
            }}
            ondragend={() => (dragId = overId = null)}>⋮⋮</span>
        {/if}
        <button class="head" aria-expanded={open} onclick={() => store.focus.toggle(ref)}>
          <span class="dot" style:background={p.color}></span>
          <span class="name">
            {p.name}
            {#if p.category}<small>{categoryLabel(p.category)}</small>{/if}
          </span>
          {#if warns.length}
            <span class="warn" class:err={warns.some((w) => w.level === 'error')} title={warns.map((w) => w.message).join('\n')}>!</span>
          {/if}
          <span class="when">{fmtStay(p.arrive_date, p.arrive_time, p.depart_date, p.depart_time)}</span>
        </button>
      </div>
      {#if open && store.focus.isEditing(ref)}
        <div class="edit">
          <input value={p.name} oninput={(e) => store.patchPlace(p.id, { name: e.currentTarget.value })} aria-label="Place name" />
          <div class="dates">
            <label class="field">Category
              <select value={p.category} onchange={(e) => store.patchPlace(p.id, { category: e.currentTarget.value })}>
                <option value="">None</option>
                {#each CATEGORIES as c}<option value={c.id}>{c.label}</option>{/each}
              </select>
            </label>
            <label class="field">Order
              <div class="move">
                <button disabled={idx === 0 || !!filter} onclick={() => store.movePlace(p.id, places.indexOf(p) - 1)} aria-label="Move up">↑ Up</button>
                <button disabled={places.indexOf(p) === places.length - 1 || !!filter} onclick={() => store.movePlace(p.id, places.indexOf(p) + 1)} aria-label="Move down">↓ Down</button>
              </div>
            </label>
          </div>
          <div class="swatches" role="radiogroup" aria-label="Colour">
            {#each PALETTE as c}
              <button
                class="sw"
                class:on={p.color === c}
                style:background={c}
                role="radio"
                aria-checked={p.color === c}
                aria-label={c}
                onclick={() => store.patchPlace(p.id, { color: c })}
              ></button>
            {/each}
          </div>
          <label class="field">Address
            <div class="addr">
              <input
                placeholder="Type an address, then Find"
                value={p.address}
                oninput={(e) => store.patchPlace(p.id, { address: e.currentTarget.value })}
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    findTyped(p)
                  }
                }}
              />
              <button class="ghost" disabled={finding === p.id || !p.address.trim()} onclick={() => findTyped(p)} title="Search the map for this address and move the pin to it">
                {finding === p.id ? '…' : 'Find'}
              </button>
              <button class="ghost" disabled={looking === p.id} onclick={() => lookup(p.id)} title="Show the address of the building nearest the pin">
                {looking === p.id ? '…' : 'From pin'}
              </button>
            </div>
          </label>
          {#if found?.id === p.id}
            <div class="sugg">
              {#if found.results.length}
                <p class="note">Pick the right match. This moves the pin to it.</p>
                <div class="matches">
                  {#each found.results as r}
                    <button class="match" onclick={() => useResult(p, r)}>
                      <strong>{r.address}</strong>
                      <small>{r.detail}</small>
                    </button>
                  {/each}
                </div>
              {:else}
                <p class="note">{found.failed ? 'Could not reach the search service. Try again in a moment.' : 'No matches. Try adding the city, or a fuller street name.'}</p>
              {/if}
              <div class="acts"><button class="ghost" onclick={() => (found = null)}>Close</button></div>
            </div>
          {/if}
          {#if suggestion?.id === p.id}
            <div class="sugg">
              <p>Nearest address on the map: <strong>{suggestion.address}</strong></p>
              <p class="note">That is the building closest to the pin, so the house number can be a neighbour's. Keep yours if it is right.</p>
              <div class="acts">
                <button onclick={() => { store.patchPlace(p.id, { address: suggestion!.address }); suggestion = null }}>Use this</button>
                <button class="ghost" onclick={() => (suggestion = null)}>Keep mine</button>
              </div>
            </div>
          {/if}
          <div class="dates">
            <label class="field">Arrive
              <input type="date" value={p.arrive_date ?? ''} oninput={(e) => store.patchPlace(p.id, { arrive_date: e.currentTarget.value || null })} />
              <input type="time" value={p.arrive_time ?? ''} oninput={(e) => store.patchPlace(p.id, { arrive_time: e.currentTarget.value || null })} aria-label="Arrival time" />
            </label>
            <label class="field">Depart
              <input type="date" min={p.arrive_date ?? undefined} value={p.depart_date ?? ''} oninput={(e) => store.patchPlace(p.id, { depart_date: e.currentTarget.value || null })} />
              <input type="time" value={p.depart_time ?? ''} oninput={(e) => store.patchPlace(p.id, { depart_time: e.currentTarget.value || null })} aria-label="Departure time" />
            </label>
          </div>
          {#each warns as w}<p class="issue" class:err={w.level === 'error'}>{w.message}</p>{/each}
          <textarea placeholder="Notes — tickets, ideas, things to see…" value={p.notes} oninput={(e) => store.patchPlace(p.id, { notes: e.currentTarget.value })}></textarea>
          <ChecklistEditor placeId={p.id} />
          <AttachmentList placeId={p.id} />
          <div class="foot">
            <span class="coords">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</span>
            <span class="acts">
              <button class="ghost danger" onclick={() => store.deletePlace(p.id)}>Remove</button>
              <button class="primary" onclick={() => store.focus.stopEdit()}>Done</button>
            </span>
          </div>
        </div>
      {:else if open}
        <PlaceDetails place={p} />
      {/if}
    </li>
  {/each}
</ul>

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 10px 12px 2px; }
  .chips button { padding: 2px 9px; border-radius: 999px; font-size: 12px; color: var(--ink-2); min-height: 0; }
  .chips button.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
  ul { list-style: none; margin: 0; padding: 4px 0; }
  li { border-bottom: 1px solid var(--line); }
  li.open, li.hl { background: var(--hover); }
  li.hl { box-shadow: inset 2px 0 0 var(--accent); }
  li.over { box-shadow: inset 0 2px 0 var(--accent); }
  .row { display: flex; align-items: center; }
  .grip { padding: 10px 2px 10px 10px; color: var(--ink-3); cursor: grab; user-select: none; letter-spacing: -2px; font-size: 13px; }
  @media (pointer: coarse) { .grip { display: none; } }
  .head { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; border: none; border-radius: 0; text-align: left; padding: 10px 12px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name small { display: block; font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-3); }
  .when { color: var(--ink-2); font-size: 12px; white-space: nowrap; }
  .warn { flex: none; width: 16px; height: 16px; border-radius: 50%; background: var(--warn); color: var(--panel); font-size: 11px; font-weight: 700; text-align: center; line-height: 16px; }
  .warn.err { background: var(--danger); }
  .issue { margin: 0; font-size: 12px; color: var(--warn); }
  .issue.err { color: var(--danger); }
  .edit { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; }
  .swatches { display: flex; flex-wrap: wrap; gap: 6px; }
  .sw { width: 20px; height: 20px; min-height: 0; padding: 0; border-radius: 50%; border: 2px solid var(--panel); box-shadow: 0 0 0 1px var(--line); }
  .sw.on { box-shadow: 0 0 0 2px var(--ink); }
  .sugg { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid var(--line); border-radius: var(--radius); font-size: 13px; }
  .sugg p { margin: 0; overflow-wrap: anywhere; }
  .sugg .note { font-size: 12px; color: var(--ink-3); }
  .matches { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--radius); padding: 2px; }
  .match { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; width: 100%; border: none; text-align: left; }
  .match small { color: var(--ink-2); font-size: 12px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .addr, .move { display: flex; gap: 4px; }
  .move button { flex: 1; white-space: nowrap; }
  .addr button { white-space: nowrap; }
  .dates { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .foot { display: flex; justify-content: space-between; align-items: center; }
  .acts { display: flex; gap: 6px; align-items: center; }
  .coords { color: var(--ink-3); font-size: 12px; font-variant-numeric: tabular-nums; }
  .empty { padding: 16px; color: var(--ink-2); margin: 0; }
</style>
