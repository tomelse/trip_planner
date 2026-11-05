<script lang="ts">
  import { store } from '../lib/store.svelte'
  import { hoverable, revealRow } from '../lib/hoverable'
  import { fmtStay } from '../lib/dates'
  import { CATEGORIES, categoryLabel } from '../lib/categories'
  import { PALETTE } from '../lib/palette'
  import ChecklistEditor from './ChecklistEditor.svelte'
  import AttachmentList from './AttachmentList.svelte'

  let list: HTMLUListElement | undefined = $state()
  // Bring the open place into view, and the one being hovered on the map.
  $effect(() => revealRow(list, store.focus.selected?.type === 'place' ? store.focus.selected.id : null))
  $effect(() => revealRow(list, store.focus.mapHoverId('place')))

  let looking = $state<number | null>(null)
  async function lookup(id: number) {
    looking = id
    await store.refreshAddress(id)
    looking = null
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
      {#if open}
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
              <input placeholder="Street address" value={p.address} oninput={(e) => store.patchPlace(p.id, { address: e.currentTarget.value })} />
              <button class="ghost" disabled={looking === p.id} onclick={() => lookup(p.id)} title="Look up the address for this pin">
                {looking === p.id ? '…' : 'Look up'}
              </button>
            </div>
          </label>
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
            <button class="ghost danger" onclick={() => store.deletePlace(p.id)}>Remove</button>
          </div>
        </div>
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
  .addr, .move { display: flex; gap: 4px; }
  .move button { flex: 1; white-space: nowrap; }
  .addr button { white-space: nowrap; }
  .dates { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .foot { display: flex; justify-content: space-between; align-items: center; }
  .coords { color: var(--ink-3); font-size: 12px; font-variant-numeric: tabular-nums; }
  .empty { padding: 16px; color: var(--ink-2); margin: 0; }
</style>
