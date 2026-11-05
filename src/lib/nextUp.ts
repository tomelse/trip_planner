import { dayDiff, iso } from './dates'
import { legTimes, legTz } from './legs'
import { toUtc, tzAt } from './tz'
import type { TripDetail } from './types'

export interface NextUp {
  kind: 'leg' | 'place'
  id: number
  status: 'upcoming' | 'in-transit'
  /** When it starts (UTC ms). For an all-day item, the start of that day. */
  at: number
  /** Whether a time of day is known, i.e. whether a countdown means anything. */
  timed: boolean
  /** In transit only: when the leg arrives, if known. */
  until: number | null
}

/**
 * The leg in progress, else the soonest thing still to come: a leg departing, or arriving at a place.
 * Times are read in the time zone of the place they refer to, so "09:30 in London" is the right instant.
 */
export function nextUp(d: TripDetail, now: number): NextUp | null {
  const upcoming: (NextUp & { end: number })[] = []

  for (const l of d.legs) {
    if (!l.depart_date) continue
    const t = legTimes(l, d.places)
    if (t.dep !== null && t.arr !== null && t.dep <= now && now < t.arr) {
      return { kind: 'leg', id: l.id, status: 'in-transit', at: t.dep, timed: true, until: t.arr }
    }
    const tz = legTz(l, 'from', d.places).tz
    const timed = !!l.depart_time
    const at = toUtc(l.depart_date, l.depart_time ?? '00:00', tz)
    const end = timed ? at : toUtc(l.depart_date, '23:59', tz)
    if (end >= now) upcoming.push({ kind: 'leg', id: l.id, status: 'upcoming', at, timed, until: null, end })
  }

  for (const p of d.places) {
    if (!p.arrive_date) continue
    const tz = tzAt(p.lat, p.lng)
    const timed = !!p.arrive_time
    const at = toUtc(p.arrive_date, p.arrive_time ?? '00:00', tz)
    const end = timed ? at : toUtc(p.arrive_date, '23:59', tz)
    if (end >= now) upcoming.push({ kind: 'place', id: p.id, status: 'upcoming', at, timed, until: null, end })
  }

  // An all-day item that has already begun counts as happening now, so it sorts by "now", not by midnight.
  const key = (u: { at: number }) => Math.max(u.at, now)
  upcoming.sort((a, b) => key(a) - key(b) || a.at - b.at)
  const first = upcoming[0]
  if (!first) return null
  const { end: _end, ...next } = first
  return next
}

/** "45 min", "3 h 20 min", "1 d 4 h", "5 days". Whole minutes, rounded down. */
export function fmtCountdown(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000))
  if (min < 1) return 'less than a minute'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
  const days = Math.floor(h / 24)
  return days >= 3 ? `${days} days` : `${days} d ${h % 24} h`
}

/** "Today", "Tomorrow", "In 4 days", relative to the device's calendar day. */
export function fmtDayAway(date: string, today = iso(new Date())): string {
  const n = dayDiff(today, date)
  if (n <= 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  return `In ${n} days`
}
