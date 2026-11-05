import type { Leg, LegMode, Place } from './types'
import { dayDiff } from './dates'
import { fmtDuration, fmtOffset, toUtc, tzAt } from './tz'

export const MODES: { id: LegMode; label: string }[] = [
  { id: 'flight', label: 'Flight' },
  { id: 'train', label: 'Train' },
  { id: 'bus', label: 'Bus' },
  { id: 'ferry', label: 'Ferry' },
  { id: 'car', label: 'Car' },
  { id: 'other', label: 'Other' },
]

export const modeLabel = (m: LegMode) => MODES.find((x) => x.id === m)?.label ?? m

export const legTitle = (l: Leg) => `${l.from_name || '?'} → ${l.to_name || '?'}`

/** Days the arrival falls after departure, e.g. 1 for a red-eye. Wall-clock dates, so no timezone maths. */
export const dayOffset = (l: Leg) => (l.depart_date && l.arrive_date ? Math.max(0, dayDiff(l.depart_date, l.arrive_date)) : 0)

export const carrierLabel = (m: LegMode) => (m === 'flight' ? 'Airline' : m === 'other' ? 'Operator' : 'Carrier')
export const numberLabel = (m: LegMode) => (m === 'flight' ? 'Flight no.' : m === 'train' ? 'Train no.' : 'Number')

export type End = 'from' | 'to'

/** Where a leg starts or ends: its own located point (airport, station) or a linked place pin. */
export function endpoint(l: Leg, end: End, places: Place[]): [number, number] | null {
  const lat = l[`${end}_lat` as const]
  const lng = l[`${end}_lng` as const]
  if (lat !== null && lng !== null) return [lat, lng]
  const p = places.find((x) => x.id === l[`${end}_place_id` as const])
  return p ? [p.lat, p.lng] : null
}

export function legPoints(l: Leg, places: Place[]): [number, number][] | null {
  const a = endpoint(l, 'from', places)
  const b = endpoint(l, 'to', places)
  return a && b ? [a, b] : null
}

/** Time zone for one end of a leg: the manual override, else looked up from where it is. */
export function legTz(l: Leg, end: End, places: Place[]): { tz: string | null; detected: boolean } {
  const manual = l[`${end}_tz` as const]
  if (manual) return { tz: manual, detected: false }
  const pt = endpoint(l, end, places)
  return { tz: pt ? tzAt(pt[0], pt[1]) : null, detected: true }
}

export interface LegTimes {
  dep: number | null
  arr: number | null
  depTz: string | null
  arrTz: string | null
}

/** Absolute (UTC) departure/arrival instants; null where a date or time is missing. */
export function legTimes(l: Leg, places: Place[]): LegTimes {
  const depTz = legTz(l, 'from', places).tz
  const arrTz = legTz(l, 'to', places).tz
  return {
    depTz,
    arrTz,
    dep: l.depart_date && l.depart_time ? toUtc(l.depart_date, l.depart_time, depTz) : null,
    arr: l.arrive_date && l.arrive_time ? toUtc(l.arrive_date, l.arrive_time, arrTz) : null,
  }
}

const BASE_BEND = 0.18
const BEND_STEP = 0.12

/**
 * How far each leg's arc bows. Legs over the same route in the same direction fan out in departure order;
 * the opposite direction (the return) bows the other way on its own. Computed over all legs so a leg's arc
 * doesn't change shape when only some are being shown.
 */
export function legBends(legs: Leg[], places: Place[]): Map<number, number> {
  const seen = new Map<string, number>()
  const out = new Map<number, number>()
  const ordered = [...legs].sort(
    (a, b) =>
      (a.depart_date ?? '9').localeCompare(b.depart_date ?? '9') ||
      (a.depart_time ?? '').localeCompare(b.depart_time ?? '') ||
      a.id - b.id,
  )
  for (const l of ordered) {
    const a = endpoint(l, 'from', places)
    const b = endpoint(l, 'to', places)
    if (!a || !b) continue
    // ~10 km buckets, so the same airport located twice still counts as the same route.
    const key = `${a[0].toFixed(1)},${a[1].toFixed(1)}>${b[0].toFixed(1)},${b[1].toFixed(1)}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    out.set(l.id, BASE_BEND + BEND_STEP * n)
  }
  return out
}

/** "Europe/London · UTC+1" for the zone at one end, flagged when it was looked up rather than chosen. */
export function legTzNote(l: Leg, end: End, places: Place[]): string {
  const { tz, detected } = legTz(l, end, places)
  if (!tz) return 'Unknown. Locate this end or pick a zone.'
  const date = end === 'from' ? l.depart_date : l.arrive_date
  const time = (end === 'from' ? l.depart_time : l.arrive_time) ?? '12:00'
  const at = date ? toUtc(date, time, tz) : Date.now()
  return `${tz} · ${fmtOffset(at, tz)}${detected ? ' (detected)' : ''}`
}

/** "8h 15m" when both ends have a date and time, else ''. */
export function legDuration(l: Leg, places: Place[]): string {
  const t = legTimes(l, places)
  return t.dep !== null && t.arr !== null && t.arr > t.dep ? fmtDuration((t.arr - t.dep) / 60000) : ''
}
