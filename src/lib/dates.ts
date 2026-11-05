export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

export const fmt = (s: string | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  s ? parse(s).toLocaleDateString(undefined, opts) : ''

/** Inclusive date range of a stay; a place with only one date is a single-day stay. */
export function stayRange(arrive: string | null, depart: string | null): [string, string] | null {
  const a = arrive ?? depart
  if (!a) return null
  const b = depart ?? a
  return b < a ? [b, a] : [a, b]
}

export const fmtTime = (t: string | null) => t ?? ''

/** "14 Apr, 09:30" / "14 Apr" / "09:30" depending on what is set. */
export const fmtWhen = (date: string | null, time: string | null) =>
  [fmt(date), fmtTime(time)].filter(Boolean).join(', ')

export const dayDiff = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000)

/** "14 Apr, 15:00 – 16 Apr, 11:00", collapsing to what is actually set. */
export function fmtStay(a: string | null, at: string | null, d: string | null, dt: string | null) {
  if (!a && !d) return ''
  if (!a) return fmtWhen(d, dt)
  if (!d || d === a) return fmtWhen(a, at) + (d === a && dt ? ` – ${dt}` : '')
  return `${fmtWhen(a, at)} – ${fmtWhen(d, dt)}`
}

/** "12 Mar – 19 Mar 2026", "From 12 Mar 2026", or '' when the trip has no dates. */
export function fmtTripDates(start: string | null, end: string | null) {
  const short: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const full: Intl.DateTimeFormatOptions = { ...short, year: 'numeric' }
  if (start && end) return `${fmt(start, short)} – ${fmt(end, full)}`
  if (start) return `From ${fmt(start, full)}`
  if (end) return `Until ${fmt(end, full)}`
  return ''
}
