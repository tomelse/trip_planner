import { stayRange } from './dates'
import { endpoint, legTimes, legTitle } from './legs'
import { fmtDuration } from './tz'
import type { TripDetail } from './types'

export interface Issue {
  id: string
  level: 'error' | 'warn'
  message: string
  ref: { type: 'leg' | 'place'; id: number }
}

const km = (a: [number, number], b: [number, number]) => {
  const rad = Math.PI / 180
  const h =
    Math.sin(((b[0] - a[0]) * rad) / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(((b[1] - a[1]) * rad) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** Compare "YYYY-MM-DD" + optional "HH:mm" wall-clock values at the same place. */
const wall = (date: string, time: string | null) => `${date}T${time ?? ''}`

const MIN_CONNECTION = 60
const FAR_KM = 50

/** Things in the plan that can't work: reversed times, overlapping travel, teleporting. */
export function findIssues(d: TripDetail): Issue[] {
  const out: Issue[] = []
  const add = (level: Issue['level'], message: string, ref: Issue['ref']) =>
    out.push({ id: `${ref.type}${ref.id}:${out.length}`, level, message, ref })
  const place = (id: number | null) => d.places.find((p) => p.id === id)

  // --- individual legs
  for (const l of d.legs) {
    const ref = { type: 'leg' as const, id: l.id }
    const t = legTimes(l, d.places)
    if (t.dep !== null && t.arr !== null) {
      if (t.arr <= t.dep) add('error', `${legTitle(l)} arrives before it departs. Check the dates and time zones.`, ref)
      else if ((t.arr - t.dep) / 3_600_000 > 30) add('warn', `${legTitle(l)} takes ${fmtDuration((t.arr - t.dep) / 60000)}. Is that right?`, ref)
    } else if (l.depart_date && l.arrive_date && l.arrive_date < l.depart_date) {
      add('error', `${legTitle(l)} arrives before it departs.`, ref)
    }
  }

  // --- consecutive legs
  const dated = d.legs
    .filter((l) => l.depart_date)
    .sort((a, b) => wall(a.depart_date!, a.depart_time).localeCompare(wall(b.depart_date!, b.depart_time)))
  for (let i = 1; i < dated.length; i++) {
    const a = dated[i - 1]
    const b = dated[i]
    const ta = legTimes(a, d.places)
    const tb = legTimes(b, d.places)
    const ref = { type: 'leg' as const, id: b.id }
    if (ta.arr !== null && tb.dep !== null) {
      const gap = (tb.dep - ta.arr) / 60000
      if (gap < 0) add('error', `${legTitle(b)} departs ${fmtDuration(-gap)} before ${legTitle(a)} arrives.`, ref)
      else if (gap < MIN_CONNECTION) add('warn', `Only ${fmtDuration(gap)} between ${legTitle(a)} and ${legTitle(b)}.`, ref)
    } else if (a.arrive_date && b.depart_date! < a.arrive_date) {
      add('error', `${legTitle(b)} departs before ${legTitle(a)} arrives.`, ref)
    }
    const from = endpoint(b, 'from', d.places)
    const to = endpoint(a, 'to', d.places)
    if (from && to && km(from, to) > FAR_KM) {
      add('warn', `${legTitle(b)} starts ${Math.round(km(from, to))} km from where ${legTitle(a)} ends.`, ref)
    }
  }

  // --- stays
  for (const p of d.places) {
    const ref = { type: 'place' as const, id: p.id }
    if (p.arrive_date && p.depart_date) {
      if (p.depart_date < p.arrive_date) add('error', `${p.name}: departure is before arrival.`, ref)
      else if (p.depart_date === p.arrive_date && p.arrive_time && p.depart_time && p.depart_time < p.arrive_time)
        add('error', `${p.name}: leaves before it arrives.`, ref)
    }
  }
  const stays = d.places.filter((p) => p.category === 'stay' && p.arrive_date && p.depart_date && p.depart_date >= p.arrive_date)
  for (let i = 0; i < stays.length; i++) {
    for (let j = i + 1; j < stays.length; j++) {
      const a = stays[i]
      const b = stays[j]
      if (a.arrive_date! < b.depart_date! && b.arrive_date! < a.depart_date!)
        add('warn', `Stays overlap: ${a.name} and ${b.name}.`, { type: 'place', id: b.id })
    }
  }

  // --- legs against the places they link to (same location, so wall-clock comparison is valid)
  for (const l of d.legs) {
    const ref = { type: 'leg' as const, id: l.id }
    const dest = place(l.to_place_id)
    if (dest?.arrive_date && l.arrive_date && l.arrive_date > dest.arrive_date)
      add('error', `${legTitle(l)} arrives after you're due at ${dest.name}.`, ref)
    const origin = place(l.from_place_id)
    if (origin?.arrive_date && l.depart_date) {
      if (wall(l.depart_date, l.depart_time) < wall(origin.arrive_date, origin.arrive_time))
        add('error', `${legTitle(l)} leaves ${origin.name} before you get there.`, ref)
    }
  }

  // --- outside the trip's own dates
  const { start_date: s, end_date: e } = d.trip
  if (s || e) {
    const outside = (day: string | null) => !!day && ((!!s && day < s) || (!!e && day > e))
    for (const l of d.legs) if (outside(l.depart_date) || outside(l.arrive_date)) add('warn', `${legTitle(l)} is outside the trip dates.`, { type: 'leg', id: l.id })
    for (const p of d.places) {
      const r = stayRange(p.arrive_date, p.depart_date)
      if (r && (outside(r[0]) || outside(r[1]))) add('warn', `${p.name} is outside the trip dates.`, { type: 'place', id: p.id })
    }
  }

  return out
}
