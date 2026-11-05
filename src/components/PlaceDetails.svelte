<script lang="ts">
  import { store } from '../lib/store.svelte'
  import { fmtStay } from '../lib/dates'
  import { categoryLabel } from '../lib/categories'
  import type { Place } from '../lib/types'
  import ChecklistEditor from './ChecklistEditor.svelte'
  import AttachmentList from './AttachmentList.svelte'

  let { place }: { place: Place } = $props()

  const when = $derived(fmtStay(place.arrive_date, place.arrive_time, place.depart_date, place.depart_time))
  const warns = $derived(store.issuesFor('place', place.id))
</script>

<div class="details">
  {#if place.category}<p class="chip">{categoryLabel(place.category)}</p>{/if}
  {#if place.address}<p class="addr">{place.address}</p>{/if}
  {#if when}
    <div class="row"><span class="k">When</span><span>{when}</span></div>
  {/if}
  {#each warns as w}<p class="issue" class:err={w.level === 'error'}>{w.message}</p>{/each}
  {#if place.notes.trim()}<p class="notes">{place.notes}</p>{/if}
  <ChecklistEditor placeId={place.id} editable={false} />
  <AttachmentList placeId={place.id} editable={false} />
  <div class="foot">
    <span class="coords">{place.lat.toFixed(4)}, {place.lng.toFixed(4)}</span>
    <button onclick={() => store.focus.startEdit({ type: 'place', id: place.id })}>Edit</button>
  </div>
</div>

<style>
  .details { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; }
  p { margin: 0; }
  .chip { align-self: flex-start; font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-3); }
  .addr { color: var(--ink-2); }
  .row { display: flex; gap: 10px; font-size: 13px; }
  .k { width: 44px; flex: none; color: var(--ink-3); font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; padding-top: 2px; }
  .notes { white-space: pre-wrap; overflow-wrap: anywhere; }
  .issue { font-size: 12px; color: var(--warn); }
  .issue.err { color: var(--danger); }
  .foot { display: flex; justify-content: space-between; align-items: center; }
  .coords { color: var(--ink-3); font-size: 12px; font-variant-numeric: tabular-nums; }
</style>
