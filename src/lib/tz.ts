import tzlookup from 'tz-lookup'

/** IANA zone for a coordinate, or null if the lookup fails (e.g. invalid coordinates). */
export function tzAt(lat: number, lng: number): string | null {
  try {
    return tzlookup(lat, lng)
  } catch {
    return null
  }
}

export const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const parts = new Map<string, Intl.DateTimeFormat>()
function formatter(tz: string) {
  let f = parts.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    })
    parts.set(tz, f)
  }
  return f
}

/** Offset of `tz` from UTC in minutes at the given instant (positive = east of UTC). */
export function offsetMinutes(utcMs: number, tz: string): number {
  const p = Object.fromEntries(formatter(tz).formatToParts(new Date(utcMs)).map((x) => [x.type, Number(x.value)]))
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000)
}

/** The instant (UTC ms) at which the wall clock in `tz` reads `date` `time`. */
export function toUtc(date: string, time: string, tz: string | null): number {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  if (!tz) return wall
  // Two passes settle the offset across a DST change.
  let utc = wall - offsetMinutes(wall, tz) * 60000
  utc = wall - offsetMinutes(utc, tz) * 60000
  return utc
}

export function fmtOffset(utcMs: number, tz: string): string {
  const off = offsetMinutes(utcMs, tz)
  const sign = off < 0 ? '-' : '+'
  const h = Math.floor(Math.abs(off) / 60)
  const m = Math.abs(off) % 60
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`
}

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`
}
