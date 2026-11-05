import { dayOffset, legTitle, modeLabel } from './legs'
import { stayRange } from './dates'
import type { Leg, Place, TripDetail } from './types'

export interface Item {
  key: string
  time: string | null
  label: string
  title: string
  detail: string
  color: string | null
  ref: { type: 'leg' | 'place'; id: number }
}

export interface Day {
  day: string
  items: Item[]
}

export interface Itinerary {
  days: Day[]
  unscheduled: { places: Place[]; legs: Leg[] }
}

function legItems(l: Leg): [string, Item][] {
  const ref = { type: 'leg' as const, id: l.id }
  const base = { color: null, ref }
  const who = [l.carrier, l.number].filter(Boolean).join(' ')
  const out: [string, Item][] = []
  if (l.depart_date) {
    const off = dayOffset(l)
    const arrival = l.arrive_time ? `arrives ${l.arrive_time}${off ? ` (+${off})` : ''}` : off ? `arrives +${off}` : ''
    out.push([
      l.depart_date,
      { ...base, key: `l${l.id}d`, time: l.depart_time, label: modeLabel(l.mode), title: legTitle(l), detail: [who, arrival].filter(Boolean).join(' · ') },
    ])
  }
  if (l.arrive_date && l.arrive_date !== l.depart_date) {
    out.push([
      l.arrive_date,
      { ...base, key: `l${l.id}a`, time: l.arrive_time, label: 'Arrive', title: legTitle(l), detail: who },
    ])
  }
  return out
}

function placeItems(p: Place): [string, Item][] {
  const base = { color: p.color, ref: { type: 'place' as const, id: p.id } }
  const range = stayRange(p.arrive_date, p.depart_date)
  if (!range) return []
  const [first, last] = range
  const out: [string, Item][] = []
  if (first === last && !p.arrive_time && !p.depart_time) {
    return [[first, { ...base, key: `p${p.id}v`, time: null, label: 'Visit', title: p.name, detail: p.address }]]
  }
  if (p.arrive_date) out.push([p.arrive_date, { ...base, key: `p${p.id}a`, time: p.arrive_time, label: 'Arrive', title: p.name, detail: p.address }])
  if (p.depart_date && (p.depart_date !== p.arrive_date || p.depart_time))
    out.push([p.depart_date, { ...base, key: `p${p.id}d`, time: p.depart_time, label: 'Depart', title: p.name, detail: p.address }])
  return out
}

/** Chronological agenda: one entry per event, grouped by day, all-day items first. */
export function buildItinerary(d: TripDetail): Itinerary {
  const byDay = new Map<string, Item[]>()
  const add = ([day, item]: [string, Item]) => byDay.set(day, [...(byDay.get(day) ?? []), item])
  d.legs.flatMap(legItems).forEach(add)
  d.places.flatMap(placeItems).forEach(add)

  // Multi-day stays are noted on days that already have something happening.
  for (const p of d.places) {
    const r = stayRange(p.arrive_date, p.depart_date)
    if (!r) continue
    for (const [day, items] of byDay) {
      if (day > r[0] && day < r[1] && !items.some((i) => i.key.startsWith(`p${p.id}`))) {
        items.push({ key: `p${p.id}s${day}`, time: null, label: 'Staying', title: p.name, detail: '', color: p.color, ref: { type: 'place', id: p.id } })
      }
    }
  }

  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, items]) => ({
      day,
      items: items.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.key.localeCompare(b.key)),
    }))

  return {
    days,
    unscheduled: {
      places: d.places.filter((p) => !p.arrive_date && !p.depart_date),
      legs: d.legs.filter((l) => !l.depart_date && !l.arrive_date),
    },
  }
}

/**
 * Days that are over, and the rest. The itinerary opens on what is still ahead, with the earlier days tucked away,
 * so the first thing under the trip banner and Next up is the next day rather than last week. If every day is in the
 * past (a finished trip) there is nothing "ahead", so everything is shown.
 */
export function splitPast(days: Day[], today: string): { past: Day[]; ahead: Day[]; collapsible: boolean } {
  const past = days.filter((d) => d.day < today)
  const ahead = days.filter((d) => d.day >= today)
  return { past, ahead, collapsible: past.length > 0 && ahead.length > 0 }
}
