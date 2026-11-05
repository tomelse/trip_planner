<script lang="ts">
  import { store } from '../lib/store.svelte'
  import { hoverable } from '../lib/hoverable'
  import { addDays, dayDiff, fmt, fmtStay, iso, parse, stayRange } from '../lib/dates'
  import { dayOffset, legTitle, modeLabel } from '../lib/legs'
  import type { Leg, Place } from '../lib/types'
  import ItineraryView from './ItineraryView.svelte'

  type View = 'month' | 'agenda'
  const VIEW_KEY = 'trips:calendar-view'
  let view = $state<View>(
    (() => {
      try {
        return localStorage.getItem(VIEW_KEY) === 'agenda' ? 'agenda' : 'month'
      } catch {
        return 'month'
      }
    })(),
  )
  function setView(v: View) {
    view = v
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {}
  }

  const detail = $derived(store.current!)
  const todayIso = iso(new Date())

  let cursor = $state(startOfMonth(new Date()))
  let selectedDay = $state<string | null>(null)
  let lastTrip = -1

  function startOfMonth(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), 1)
  }

  // Jump to the trip's first month whenever the trip changes.
  $effect(() => {
    const t = detail.trip
    if (t.id === lastTrip) return
    lastTrip = t.id
    selectedDay = null
    const first = t.start_date ?? detail.places.map((p) => p.arrive_date).filter(Boolean).sort()[0]
    cursor = startOfMonth(first ? parse(first) : new Date())
  })

  // Monday-first grid covering whole weeks.
  const days = $derived.by(() => {
    const first = cursor
    const offset = (first.getDay() + 6) % 7
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0)
    const total = Math.ceil((offset + last.getDate()) / 7) * 7
    return Array.from({ length: total }, (_, i) => {
      const d = addDays(first, i - offset)
      return { iso: iso(d), n: d.getDate(), inMonth: d.getMonth() === first.getMonth() }
    })
  })

  function staysOn(day: string): Place[] {
    return detail.places.filter((p) => {
      const r = stayRange(p.arrive_date, p.depart_date)
      return r && r[0] <= day && day <= r[1]
    })
  }

  /** Legs that depart or arrive on this day, with the time that applies, earliest first. */
  function legsOn(day: string): { leg: Leg; time: string | null; kind: 'dep' | 'arr' }[] {
    const out: { leg: Leg; time: string | null; kind: 'dep' | 'arr' }[] = []
    for (const leg of detail.legs) {
      if (leg.depart_date === day) out.push({ leg, time: leg.depart_time, kind: 'dep' })
      if (leg.arrive_date === day && leg.arrive_date !== leg.depart_date) out.push({ leg, time: leg.arrive_time, kind: 'arr' })
    }
    return out.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  }

  const inTrip = (day: string) =>
    !!detail.trip.start_date && !!detail.trip.end_date && detail.trip.start_date <= day && day <= detail.trip.end_date

  const unscheduled = $derived(detail.places.filter((p) => !p.arrive_date && !p.depart_date))
  const dayStays = $derived(selectedDay ? staysOn(selectedDay) : [])
  const dayLegs = $derived(selectedDay ? legsOn(selectedDay) : [])

  // Drag a stay's bar onto another day to move the whole stay by that many days.
  let drag = $state<{ id: number; from: string } | null>(null)
  let dropDay = $state<string | null>(null)

  function dropOn(day: string) {
    if (drag) store.shiftStay(drag.id, dayDiff(drag.from, day))
    drag = dropDay = null
  }

  function schedule(id: number) {
    if (!selectedDay) return
    store.patchPlace(id, { arrive_date: selectedDay, depart_date: selectedDay })
  }

  function shift(n: number) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + n, 1)
  }
</script>

<div class="viewbar">
  <div class="views" role="tablist">
    <button role="tab" aria-selected={view === 'month'} class:on={view === 'month'} onclick={() => setView('month')}>Month</button>
    <button role="tab" aria-selected={view === 'agenda'} class:on={view === 'agenda'} onclick={() => setView('agenda')}>Itinerary</button>
  </div>
</div>

{#if view === 'agenda'}
  <ItineraryView />
{:else}
<div class="head">
  <strong>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
  <span>
    <button class="ghost" onclick={() => shift(-1)} aria-label="Previous month">←</button>
    <button class="ghost" onclick={() => (cursor = startOfMonth(new Date()))}>Today</button>
    <button class="ghost" onclick={() => shift(1)} aria-label="Next month">→</button>
  </span>
</div>

<div class="grid">
  {#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as d}<span class="dow">{d}</span>{/each}
  {#each days as d (d.iso)}
    {@const stays = staysOn(d.iso)}
    {@const travel = legsOn(d.iso).length}
    <div
      class="day"
      role="button"
      tabindex="0"
      class:dim={!d.inMonth}
      class:trip={inTrip(d.iso)}
      class:today={d.iso === todayIso}
      class:sel={d.iso === selectedDay}
      class:drop={dropDay === d.iso && drag !== null}
      onclick={() => (selectedDay = d.iso === selectedDay ? null : d.iso)}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          selectedDay = d.iso === selectedDay ? null : d.iso
        }
      }}
      ondragover={(e) => {
        if (!drag) return
        e.preventDefault()
        dropDay = d.iso
      }}
      ondrop={(e) => {
        e.preventDefault()
        dropOn(d.iso)
      }}
    >
      <span class="n">{d.n}</span>
      <span class="bars">
        {#each stays.slice(0, 3) as p (p.id)}
          {@const r = stayRange(p.arrive_date, p.depart_date)!}
          {@const ref = { type: 'place' as const, id: p.id }}
          <i
            style:background={p.color}
            class:start={r[0] === d.iso}
            class:end={r[1] === d.iso}
            class:hl={store.focus.isHot(ref)}
            class:open={store.focus.isSelected(ref)}
            role="button"
            tabindex="0"
            aria-label={p.name}
            draggable="true"
            title="{p.name}: drag to another day to move this stay"
            ondragstart={(e) => {
              drag = { id: p.id, from: d.iso }
              e.dataTransfer?.setData('text/plain', p.name)
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
            }}
            ondragend={() => (drag = dropDay = null)}
            onclick={(e) => {
              e.stopPropagation()
              store.focus.toggle(ref)
            }}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                store.focus.toggle(ref)
              }
            }}
            use:hoverable={ref}
          ></i>
        {/each}
        {#if stays.length > 3}<em>+{stays.length - 3}</em>{/if}
      </span>
      {#if travel}<span class="tick" title="{travel} travel"></span>{/if}
    </div>
  {/each}
</div>

{#if selectedDay}
  <section>
    <h3>{fmt(selectedDay, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
    {#each dayStays as p (p.id)}
      {@const ref = { type: 'place' as const, id: p.id }}
      <div class="srow">
        <button class="stay" class:hl={store.focus.isHot(ref)} class:open={store.focus.isSelected(ref)} onclick={() => store.focus.toggle(ref)} use:hoverable={ref}>
          <span class="dot" style:background={p.color}></span>
          <span>{p.name}</span>
          <small>{fmtStay(p.arrive_date, p.arrive_time, p.depart_date, p.depart_time)}</small>
        </button>
        <button class="ghost shift" onclick={() => store.shiftStay(p.id, -1)} title="Move this stay one day earlier" aria-label="Move one day earlier">−1d</button>
        <button class="ghost shift" onclick={() => store.shiftStay(p.id, 1)} title="Move this stay one day later" aria-label="Move one day later">+1d</button>
      </div>
    {/each}
    {#each dayLegs as { leg, time, kind } (leg.id + kind)}
      {@const ref = { type: 'leg' as const, id: leg.id }}
      <button class="stay" class:hl={store.focus.isHot(ref)} class:open={store.focus.isSelected(ref)} onclick={() => store.focus.toggle(ref)} use:hoverable={ref}>
        <span class="mode">{modeLabel(leg.mode)}</span>
        <span>{legTitle(leg)}</span>
        <small>
          {kind === 'dep' ? 'dep' : 'arr'}{time ? ` ${time}` : ''}{kind === 'dep' && !dayOffset(leg) && leg.arrive_time ? ` → ${leg.arrive_time}` : kind === 'dep' && dayOffset(leg) ? ` · arr +${dayOffset(leg)}` : ''}
        </small>
      </button>
    {/each}
    {#if dayStays.length === 0 && dayLegs.length === 0}
      <p class="muted">Nothing planned.</p>
    {/if}
    {#if unscheduled.length}
      <select onchange={(e) => { schedule(Number(e.currentTarget.value)); e.currentTarget.value = '' }}>
        <option value="">Schedule a place here…</option>
        {#each unscheduled as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
    {/if}
  </section>
{:else}
  <p class="muted hint">Select a day to see or schedule stays. Set dates on a place to have it appear here.</p>
{/if}
{/if}

<style>
  /* Stays put while the list scrolls, so the switch is always at the top. */
  .viewbar {
    position: sticky; top: var(--sticky-top, 0px); z-index: 2;
    height: var(--viewbar-h); box-sizing: border-box; padding: 12px 12px 8px; background: var(--panel);
  }
  .views { display: flex; gap: 0; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
  .views button { flex: 1; border: none; border-radius: 0; color: var(--ink-2); padding: 4px 8px; }
  .views button + button { border-left: 1px solid var(--line); }
  .views button.on { background: var(--hover); color: var(--ink); }
  .head { display: flex; justify-content: space-between; align-items: center; padding: 12px 12px 8px; }
  .head button { padding: 2px 8px; }
  .grid { display: grid; grid-template-columns: repeat(7, 1fr); padding: 0 12px; gap: 1px; }
  .dow { text-align: center; font-size: 11px; color: var(--ink-3); padding-bottom: 4px; }
  .day {
    position: relative; display: flex; flex-direction: column; gap: 3px; align-items: stretch; height: 54px; padding: 4px 0 4px;
    border: 1px solid transparent; border-radius: 0; text-align: center;
  }
  .day { cursor: pointer; }
  .day:hover { background: var(--hover); }
  .day.drop { outline: 2px solid var(--accent); outline-offset: -2px; }
  .day.trip { background: var(--accent-soft); }
  .day.dim { opacity: 0.4; }
  .day.today .n { color: var(--accent); font-weight: 700; }
  .day.sel { border-color: var(--ink); }
  .n { font-size: 12px; }
  .bars { display: flex; flex-direction: column; gap: 2px; }
  .bars i { display: block; height: 8px; border-block: 2px solid transparent; background-clip: padding-box; cursor: grab; }
  .bars i:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }
  .bars i.hl, .bars i.open { border-block-width: 0; }
  .bars i.start { margin-left: 4px; border-radius: 2px 0 0 2px; }
  .bars i.end { margin-right: 4px; border-radius: 0 2px 2px 0; }
  .bars em { font-size: 10px; font-style: normal; color: var(--ink-3); line-height: 1; }
  section { padding: 16px 12px; display: flex; flex-direction: column; gap: 8px; }
  h3 { margin: 0 0 4px; font-size: 14px; }
  .stay { display: flex; gap: 8px; align-items: center; text-align: left; }
  .mode { font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--travel); width: 44px; }
  .tick { position: absolute; top: 4px; right: 4px; width: 5px; height: 5px; background: var(--travel); }
  .srow { display: flex; gap: 4px; }
  .srow .stay { flex: 1; min-width: 0; }
  .shift { padding: 0 6px; font-size: 12px; white-space: nowrap; }
  .stay.hl, .stay.open { background: var(--hover); }
  .stay small { margin-left: auto; color: var(--ink-2); }
  .dot { width: 8px; height: 8px; border-radius: 50%; }
  .muted { color: var(--ink-2); margin: 0; }
  .hint { padding: 16px 12px; }
</style>
