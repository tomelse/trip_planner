<script lang="ts">
  import { store } from '../lib/store.svelte'
  import { fmt, fmtTime } from '../lib/dates'
  import { endpoint, legTitle, modeLabel, legTzNote } from '../lib/legs'
  import { fmtCountdown, fmtDayAway, nextUp } from '../lib/nextUp'
  import { directionsUrl } from '../lib/maps'

  let now = $state(Date.now())
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000)
    return () => clearInterval(t)
  })

  const d = $derived(store.current)
  const next = $derived(d ? nextUp(d, now) : null)
  const leg = $derived(next?.kind === 'leg' ? d?.legs.find((l) => l.id === next.id) : undefined)
  const place = $derived(next?.kind === 'place' ? d?.places.find((p) => p.id === next.id) : undefined)

  const day = (date: string | null) => fmt(date, { weekday: 'short', day: 'numeric', month: 'short' })
  const operator = $derived(leg ? [leg.carrier, leg.number].filter(Boolean).join(' ') : '')
  const dep = $derived(leg ? endpoint(leg, 'from', d?.places ?? []) : null)

  /** The headline: a countdown when there's a time, else how many days away. */
  const headline = $derived.by(() => {
    if (!next) return ''
    if (next.status === 'in-transit') return next.until ? `Arrives in ${fmtCountdown(next.until - now)}` : 'In transit'
    if (next.timed && next.at > now) return `${leg ? 'Departs' : 'Arrive'} in ${fmtCountdown(next.at - now)}`
    if (next.timed) return leg ? 'Departing now' : 'Arriving now'
    const date = leg?.depart_date ?? place?.arrive_date
    return date ? fmtDayAway(date) : ''
  })

  function open() {
    if (next) store.focus.select({ type: next.kind, id: next.id })
  }
</script>

{#if next && (leg || place)}
  <div class="card" class:transit={next.status === 'in-transit'}>
    <p class="kicker">{next.status === 'in-transit' ? 'In transit' : 'Next up'}</p>
    <p class="headline">{headline}</p>

    {#if leg}
      <p class="title">{legTitle(leg)}</p>
      <p class="sub">{modeLabel(leg.mode)}{#if operator} · {operator}{/if}</p>
      <div class="times">
        {#if leg.depart_date}
          <p><span class="k">Departs</span> {[day(leg.depart_date), leg.depart_time && fmtTime(leg.depart_time)].filter(Boolean).join(', ')}
            <small>{legTzNote(leg, 'from', d?.places ?? [])}</small></p>
        {/if}
        {#if leg.arrive_date || leg.arrive_time}
          <p><span class="k">Arrives</span> {[day(leg.arrive_date), leg.arrive_time && fmtTime(leg.arrive_time)].filter(Boolean).join(', ')}</p>
        {/if}
      </div>
      {#if leg.confirmation}<p class="ref"><span class="k">Booking ref</span><strong>{leg.confirmation}</strong></p>{/if}
    {:else if place}
      <p class="title">{place.name}</p>
      {#if place.address}<p class="sub">{place.address}</p>{/if}
      <div class="times">
        <p><span class="k">Arrive</span> {[day(place.arrive_date), place.arrive_time && fmtTime(place.arrive_time)].filter(Boolean).join(', ')}</p>
      </div>
    {/if}

    <div class="actions">
      <button onclick={open}>Details</button>
      {#if leg && dep}<a class="btn" href={directionsUrl(dep[0], dep[1])} target="_blank" rel="noopener">Directions to {leg.from_name || 'start'}</a>
      {:else if place}<a class="btn" href={directionsUrl(place.lat, place.lng)} target="_blank" rel="noopener">Directions</a>{/if}
    </div>
  </div>
{/if}

<style>
  .card { margin: 0 12px 4px; padding: 12px 14px; border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: var(--radius); background: var(--hover); }
  .card.transit { border-left-color: var(--travel); }
  p { margin: 0; }
  .kicker { font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3); }
  .headline { font-size: 22px; font-weight: 600; line-height: 1.2; margin: 2px 0 8px; }
  .title { font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
  .sub { color: var(--ink-2); font-size: 13px; margin-top: 1px; }
  .times { margin-top: 8px; display: flex; flex-direction: column; gap: 3px; font-size: 14px; }
  .times small { display: block; color: var(--ink-3); font-size: 11px; }
  .k { display: inline-block; min-width: 58px; color: var(--ink-3); font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; }
  .ref { margin-top: 10px; }
  .ref .k { display: block; }
  .ref strong { font-size: 24px; letter-spacing: 0.08em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .btn { display: inline-block; padding: 5px 10px; border: 1px solid var(--line); border-radius: var(--radius); color: inherit; text-decoration: none; background: transparent; }
  .btn:hover { background: var(--hover); }
</style>
