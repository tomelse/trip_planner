<script lang="ts">
  import { store } from '../lib/store.svelte'
  import { hoverable } from '../lib/hoverable'
  import { fmt, iso } from '../lib/dates'
  import { legTitle, modeLabel } from '../lib/legs'
  import { buildItinerary } from '../lib/itinerary'

  const itin = $derived(buildItinerary(store.current!))
  const today = iso(new Date())
  const nextDay = $derived(itin.days.find((d) => d.day >= today)?.day)

  let root: HTMLDivElement | undefined = $state()
  let scrolledFor = -1
  $effect(() => {
    const id = store.current?.trip.id ?? -1
    if (!root || id === scrolledFor) return
    scrolledFor = id
    if (nextDay) root.querySelector(`[data-day="${nextDay}"]`)?.scrollIntoView({ block: 'start' })
  })
</script>

<div bind:this={root} class="agenda">
  {#each itin.days as d (d.day)}
    <section data-day={d.day} class:today={d.day === today} class:past={d.day < today}>
      <h3>
        <span class="dnum">{fmt(d.day, { day: 'numeric' })}</span>
        <span>{fmt(d.day, { weekday: 'long' })}<small>{fmt(d.day, { month: 'long', year: 'numeric' })}</small></span>
        {#if d.day === today}<em>Today</em>{/if}
      </h3>
      {#each d.items as i (i.key)}
        <button
          class="item"
          class:hl={store.focus.isHot(i.ref)}
          class:open={store.focus.isSelected(i.ref)}
          onclick={() => store.focus.toggle(i.ref)}
          use:hoverable={i.ref}
        >
          <span class="time">{i.time ?? (i.label === 'Staying' || i.label === 'Visit' ? 'all day' : '')}</span>
          <span class="bar" style:background={i.color ?? 'var(--travel)'}></span>
          <span class="text">
            <span class="kind">{i.label}</span>
            <span class="title" class:muted={i.label === 'Staying'}>{i.title}</span>
            {#if i.detail}<small>{i.detail}</small>{/if}
          </span>
        </button>
      {/each}
    </section>
  {/each}

  {#if itin.days.length === 0}
    <p class="muted pad">Nothing scheduled yet. Add dates and times to places and travel and they'll line up here.</p>
  {/if}

  {#if itin.unscheduled.places.length || itin.unscheduled.legs.length}
    <section class="unscheduled">
      <h3><span>Unscheduled</span></h3>
      {#each itin.unscheduled.legs as l (l.id)}
        {@const ref = { type: 'leg' as const, id: l.id }}
        <button class="item" class:hl={store.focus.isHot(ref)} class:open={store.focus.isSelected(ref)} onclick={() => store.focus.toggle(ref)} use:hoverable={ref}>
          <span class="time"></span><span class="bar" style:background="var(--travel)"></span>
          <span class="text"><span class="kind">{modeLabel(l.mode)}</span><span class="title">{legTitle(l)}</span></span>
        </button>
      {/each}
      {#each itin.unscheduled.places as p (p.id)}
        {@const ref = { type: 'place' as const, id: p.id }}
        <button class="item" class:hl={store.focus.isHot(ref)} class:open={store.focus.isSelected(ref)} onclick={() => store.focus.toggle(ref)} use:hoverable={ref}>
          <span class="time"></span><span class="bar" style:background={p.color}></span>
          <span class="text"><span class="kind">Place</span><span class="title">{p.name}</span></span>
        </button>
      {/each}
    </section>
  {/if}
</div>

<style>
  .agenda { margin-top: 12px; }
  section { border-top: 1px solid var(--line); padding: 10px 12px 6px; }
  section:first-child { border-top: none; }
  section.past { opacity: 0.55; }
  h3 { display: flex; align-items: center; gap: 10px; margin: 0 0 6px; font-size: 14px; font-weight: 600; }
  .dnum { font-size: 22px; font-weight: 500; width: 30px; text-align: right; font-variant-numeric: tabular-nums; }
  h3 small { display: block; font-size: 11px; font-weight: 400; color: var(--ink-3); }
  em { margin-left: auto; font-style: normal; font-size: 11px; color: var(--accent); letter-spacing: 0.04em; text-transform: uppercase; }
  section.today .dnum { color: var(--accent); }
  .item { display: flex; align-items: stretch; gap: 10px; width: 100%; border: none; text-align: left; padding: 5px 4px; margin-bottom: 2px; }
  .item.hl, .item.open { background: var(--hover); }
  .time { width: 40px; flex: none; text-align: right; font-size: 12px; color: var(--ink-2); font-variant-numeric: tabular-nums; padding-top: 1px; }
  .bar { width: 3px; border-radius: 2px; flex: none; }
  .text { display: flex; flex-direction: column; min-width: 0; }
  .kind { font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-3); }
  .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .title.muted { color: var(--ink-2); }
  small { color: var(--ink-2); font-size: 12px; }
  .muted { color: var(--ink-2); }
  .pad { padding: 16px 12px; margin: 0; }
  .unscheduled { padding-bottom: 12px; }
  .unscheduled h3 { font-size: 12px; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 400; }
</style>
