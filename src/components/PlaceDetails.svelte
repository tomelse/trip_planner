<script lang="ts">
  import { store } from '../lib/store.svelte'
  import { fmtStay } from '../lib/dates'
  import { categoryLabel } from '../lib/categories'
  import { directionsUrl } from '../lib/maps'
  import type { Place } from '../lib/types'
  import { covers } from '../lib/covers.svelte'
  import PlaceCover from './PlaceCover.svelte'
  import ChecklistEditor from './ChecklistEditor.svelte'
  import AttachmentList from './AttachmentList.svelte'

  let { place }: { place: Place } = $props()

  const when = $derived(fmtStay(place.arrive_date, place.arrive_time, place.depart_date, place.depart_time))
  const warns = $derived(store.issuesFor('place', place.id))
</script>

<div class="details">
  <PlaceCover {place} />
  <!-- With a cover photo the category is shown on the photo, so don't say it twice. -->
  {#if place.category && !(covers.enabled && covers.state(place.id)?.status === 'ready')}<p class="chip">{categoryLabel(place.category)}</p>{/if}
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
    <span class="acts">
      <a class="btn" href={directionsUrl(place.lat, place.lng)} target="_blank" rel="noopener">Directions</a>
      <button onclick={() => store.focus.startEdit({ type: 'place', id: place.id })}>Edit</button>
    </span>
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
  .coords { color: var(--ink-3); font-size: 12px; font-variant-numeric: tabular-nums; }
</style>
