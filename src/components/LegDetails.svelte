<script lang="ts">
  import { store } from '../lib/store.svelte'
  import { fmt } from '../lib/dates'
  import { carrierLabel, dayOffset, legDuration, legTitle, legTzNote, modeLabel, numberLabel } from '../lib/legs'
  import type { Leg } from '../lib/types'
  import AttachmentList from './AttachmentList.svelte'

  let { leg }: { leg: Leg } = $props()

  const places = $derived(store.current?.places ?? [])
  const warns = $derived(store.issuesFor('leg', leg.id))
  const day = (d: string | null) => fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })
  const plus = $derived(dayOffset(leg))
  const duration = $derived(legDuration(leg, places))
  const operator = $derived([leg.carrier, leg.number].filter(Boolean).join(' '))
</script>

<div class="details">
  <p class="route">{legTitle(leg)}</p>
  <p class="sub">{modeLabel(leg.mode)}{#if operator} · {operator}{/if}</p>

  {#if leg.depart_date || leg.depart_time}
    <div class="row">
      <span class="k">Departs</span>
      <span>
        {[day(leg.depart_date), leg.depart_time].filter(Boolean).join(', ')}
        <small>{legTzNote(leg, 'from', places)}</small>
      </span>
    </div>
  {/if}
  {#if leg.arrive_date || leg.arrive_time}
    <div class="row">
      <span class="k">Arrives</span>
      <span>
        {[day(leg.arrive_date), leg.arrive_time].filter(Boolean).join(', ')}{#if plus} <sup>+{plus}</sup>{/if}
        <small>{legTzNote(leg, 'to', places)}{#if duration} · {duration}{/if}</small>
      </span>
    </div>
  {/if}
  {#if leg.confirmation}
    <div class="row"><span class="k">Ref</span><span>{leg.confirmation}</span></div>
  {/if}
  {#each warns as w}<p class="issue" class:err={w.level === 'error'}>{w.message}</p>{/each}
  {#if leg.notes.trim()}<p class="notes">{leg.notes}</p>{/if}
  <AttachmentList legId={leg.id} editable={false} />
  <div class="foot">
    <small>Times are local at each end.</small>
    <button onclick={() => store.focus.startEdit({ type: 'leg', id: leg.id })}>Edit</button>
  </div>
</div>

<style>
  .details { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; }
  p { margin: 0; }
  .route { font-weight: 600; }
  .sub { color: var(--ink-2); font-size: 12px; margin-top: -4px; }
  .row { display: flex; gap: 10px; font-size: 13px; }
  .k { width: 56px; flex: none; color: var(--ink-3); font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; padding-top: 2px; }
  .row small { display: block; color: var(--ink-3); font-size: 11px; }
  sup { font-size: 9px; }
  .notes { white-space: pre-wrap; overflow-wrap: anywhere; }
  .issue { font-size: 12px; color: var(--warn); }
  .issue.err { color: var(--danger); }
  .foot { display: flex; justify-content: space-between; align-items: center; }
  .foot small { color: var(--ink-3); }
</style>
