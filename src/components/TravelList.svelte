<script lang="ts">
  import { store } from '../lib/store.svelte'
  import { hoverable, revealRow } from '../lib/hoverable'
  import { fmt, fmtTime } from '../lib/dates'
  import { MODES, carrierLabel, dayOffset, legDuration, legTitle, legTzNote, modeLabel, numberLabel } from '../lib/legs'
  import { validTz } from '../lib/tz'
  import LegDetails from './LegDetails.svelte'
  import AttachmentList from './AttachmentList.svelte'
  import type { Leg, LegMode } from '../lib/types'
  import type { SearchResult } from '../lib/geo'
  import EndpointPicker from './EndpointPicker.svelte'

  let list: HTMLUListElement | undefined = $state()
  // Bring the open leg into view, and the one being hovered on the map.
  $effect(() => revealRow(list, store.focus.selected?.type === 'leg' ? store.focus.selected.id : null))
  $effect(() => revealRow(list, store.focus.mapHoverId('leg')))

  const detail = $derived(store.current!)
  const legs = $derived(
    [...detail.legs].sort(
      (a, b) =>
        (a.depart_date ?? '9').localeCompare(b.depart_date ?? '9') ||
        (a.depart_time ?? '').localeCompare(b.depart_time ?? '') ||
        a.id - b.id,
    ),
  )

  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []

  function setTz(l: Leg, end: 'from' | 'to', v: string) {
    const tz = v.trim()
    if (tz === '' || validTz(tz)) store.patchLeg(l.id, { [`${end}_tz`]: tz || null })
  }

  // An end uses either a located point (airport, station) or a linked pin, never both.
  function pickPlace(l: Leg, end: 'from' | 'to', value: string) {
    const id = value ? Number(value) : null
    const place = detail.places.find((p) => p.id === id)
    store.patchLeg(l.id, {
      [`${end}_place_id`]: id,
      ...(id !== null && { [`${end}_lat`]: null, [`${end}_lng`]: null }),
      ...(place && { [`${end}_name`]: place.name }),
    })
  }

  function pickResult(l: Leg, end: 'from' | 'to', r: SearchResult) {
    store.patchLeg(l.id, { [`${end}_name`]: r.name, [`${end}_lat`]: r.lat, [`${end}_lng`]: r.lng, [`${end}_place_id`]: null })
  }

  function clearEnd(l: Leg, end: 'from' | 'to') {
    store.patchLeg(l.id, { [`${end}_lat`]: null, [`${end}_lng`]: null })
  }
</script>

<div class="bar"><button onclick={() => store.addLeg()}>+ Add travel</button></div>

{#if legs.length === 0}
  <p class="empty">Flights, trains, ferries — add how you get between places. Times are local to each end.</p>
{/if}

<datalist id="zones">
  {#each zones as z}<option value={z}></option>{/each}
</datalist>

<ul bind:this={list}>
  {#each legs as l (l.id)}
    {@const ref = { type: 'leg' as const, id: l.id }}
    {@const open = store.focus.isSelected(ref)}
    {@const plus = dayOffset(l)}
    {@const warns = store.issuesFor('leg', l.id)}
    <li class:open class:hl={store.focus.isHot(ref)} data-id={l.id}>
      <button class="head" aria-expanded={open} onclick={() => store.focus.toggle(ref)} use:hoverable={ref}>
        <span class="mode">{modeLabel(l.mode)}</span>
        <span class="title">{legTitle(l)}</span>
        {#if warns.length}
          <span class="warn" class:err={warns.some((w) => w.level === 'error')} title={warns.map((w) => w.message).join('\n')}>!</span>
        {/if}
        <span class="when">
          {#if l.depart_date}{fmt(l.depart_date)}{/if}{#if l.depart_time}&nbsp;{fmtTime(l.depart_time)}{/if}
          {#if l.arrive_time}→ {fmtTime(l.arrive_time)}{#if plus}<sup>+{plus}</sup>{/if}{/if}
        </span>
      </button>

      {#if open && store.focus.isEditing(ref)}
        <div class="edit">
          <div class="grid">
            <label class="field">Mode
              <select value={l.mode} onchange={(e) => store.patchLeg(l.id, { mode: e.currentTarget.value as LegMode })}>
                {#each MODES as m}<option value={m.id}>{m.label}</option>{/each}
              </select>
            </label>
            <label class="field">{carrierLabel(l.mode)}
              <input value={l.carrier} oninput={(e) => store.patchLeg(l.id, { carrier: e.currentTarget.value })} />
            </label>
          </div>
          <div class="grid">
            <label class="field">{numberLabel(l.mode)}
              <input value={l.number} oninput={(e) => store.patchLeg(l.id, { number: e.currentTarget.value })} />
            </label>
            <label class="field">Confirmation
              <input value={l.confirmation} oninput={(e) => store.patchLeg(l.id, { confirmation: e.currentTarget.value })} />
            </label>
          </div>

          <fieldset>
            <legend>From</legend>
            <EndpointPicker label="From" mode={l.mode} name={l.from_name} located={l.from_lat !== null} onname={(v) => store.patchLeg(l.id, { from_name: v })} onpick={(r) => pickResult(l, 'from', r)} onclear={() => clearEnd(l, 'from')} />
            <select value={l.from_place_id ?? ''} onchange={(e) => pickPlace(l, 'from', e.currentTarget.value)} aria-label="From place">
              <option value="">Or link to one of your pins</option>
              {#each detail.places as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
            </select>
            <div class="grid">
              <input type="date" value={l.depart_date ?? ''} oninput={(e) => store.patchLeg(l.id, { depart_date: e.currentTarget.value || null })} aria-label="Departure date" />
              <input type="time" value={l.depart_time ?? ''} oninput={(e) => store.patchLeg(l.id, { depart_time: e.currentTarget.value || null })} aria-label="Departure time" />
            </div>
            <input list="zones" placeholder="Time zone override, e.g. Europe/London" value={l.from_tz ?? ''} onchange={(e) => setTz(l, 'from', e.currentTarget.value)} aria-label="Departure time zone" />
            <small class="tz">{legTzNote(l, 'from', detail.places)}</small>
          </fieldset>

          <fieldset>
            <legend>To</legend>
            <EndpointPicker label="To" mode={l.mode} name={l.to_name} located={l.to_lat !== null} onname={(v) => store.patchLeg(l.id, { to_name: v })} onpick={(r) => pickResult(l, 'to', r)} onclear={() => clearEnd(l, 'to')} />
            <select value={l.to_place_id ?? ''} onchange={(e) => pickPlace(l, 'to', e.currentTarget.value)} aria-label="To place">
              <option value="">Or link to one of your pins</option>
              {#each detail.places as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
            </select>
            <div class="grid">
              <input type="date" min={l.depart_date ?? undefined} value={l.arrive_date ?? ''} oninput={(e) => store.patchLeg(l.id, { arrive_date: e.currentTarget.value || null })} aria-label="Arrival date" />
              <input type="time" value={l.arrive_time ?? ''} oninput={(e) => store.patchLeg(l.id, { arrive_time: e.currentTarget.value || null })} aria-label="Arrival time" />
            </div>
            <input list="zones" placeholder="Time zone override, e.g. America/New_York" value={l.to_tz ?? ''} onchange={(e) => setTz(l, 'to', e.currentTarget.value)} aria-label="Arrival time zone" />
            <small class="tz">{legTzNote(l, 'to', detail.places)}{#if legDuration(l, detail.places)} · Duration {legDuration(l, detail.places)}{/if}</small>
          </fieldset>

          {#each warns as w}<p class="issue" class:err={w.level === 'error'}>{w.message}</p>{/each}
          <textarea placeholder="Notes — seat, terminal, baggage…" value={l.notes} oninput={(e) => store.patchLeg(l.id, { notes: e.currentTarget.value })}></textarea>
          <AttachmentList legId={l.id} />
          <div class="foot">
            <small>Times are local at each end.</small>
            <span class="acts">
              <button class="ghost danger" onclick={() => store.deleteLeg(l.id)}>Remove</button>
              <button class="primary" onclick={() => store.focus.stopEdit()}>Done</button>
            </span>
          </div>
        </div>
      {:else if open}
        <LegDetails leg={l} />
      {/if}
    </li>
  {/each}
</ul>

<style>
  .bar { padding: 12px; }
  ul { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
  li { border-bottom: 1px solid var(--line); }
  li.open, li.hl { background: var(--hover); }
  li.hl { box-shadow: inset 2px 0 0 var(--accent); }
  .head { display: flex; align-items: baseline; gap: 10px; width: 100%; border: none; border-radius: 0; text-align: left; padding: 10px 12px; }
  .mode { font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--travel); flex: none; width: 44px; }
  .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .when { color: var(--ink-2); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  sup { font-size: 9px; margin-left: 1px; }
  .edit { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  fieldset { border: 1px solid var(--line); border-radius: var(--radius); margin: 0; padding: 8px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  legend { font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-3); padding: 0 4px; }
  .foot { display: flex; justify-content: space-between; align-items: center; }
  .acts { display: flex; gap: 6px; align-items: center; }
  small { color: var(--ink-3); }
  .tz { font-size: 11px; }
  .warn { flex: none; width: 16px; height: 16px; border-radius: 50%; background: var(--warn); color: var(--panel); font-size: 11px; font-weight: 700; text-align: center; line-height: 16px; }
  .warn.err { background: var(--danger); }
  .issue { margin: 0; font-size: 12px; color: var(--warn); }
  .issue.err { color: var(--danger); }
  .empty { padding: 0 12px 12px; margin: 0; color: var(--ink-2); }
</style>
