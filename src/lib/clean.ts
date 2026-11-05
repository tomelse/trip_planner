import { CATEGORIES } from './categories'
import { MODES } from './legs'
import { validTz } from './tz'

/**
 * Every value that is written to the on-device database passes through here, whether it was typed in, came from a
 * search result, or arrived in an imported backup. A backup is just a file somebody could have edited or sent, so
 * nothing in it is trusted: a value that is the wrong shape is dropped (the column keeps its default or old value).
 */

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/
export const MAX_TEXT = 20_000

export const isColor = (v: unknown): v is string => typeof v === 'string' && HEX_COLOR.test(v)

/** A cleaned value, or `undefined` when the value isn't acceptable for that column. */
type Cleaner = (v: unknown) => unknown

const text: Cleaner = (v) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : undefined)
const orNull = (ok: (v: unknown) => boolean): Cleaner => (v) => (v === null ? null : ok(v) ? v : undefined)

const realDate = (v: unknown) => {
  if (typeof v !== 'string' || !DATE.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d)) // rolls 31 Feb over to March, so a mismatch means it wasn't a real day
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}
const realTime = (v: unknown) => typeof v === 'string' && TIME.test(v)
const inRange = (min: number, max: number) => (v: unknown) => typeof v === 'number' && v >= min && v <= max
const id = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0

const lat = inRange(-90, 90)
const lng = inRange(-180, 180)
const oneOf = (allowed: readonly string[], allowEmpty = false): Cleaner => (v) =>
  typeof v === 'string' && ((allowEmpty && v === '') || allowed.includes(v)) ? v : undefined

const CLEANERS: Record<string, Cleaner> = {
  // text
  name: text, address: text, notes: text, title: text, body: text,
  from_name: text, to_name: text, carrier: text, number: text, confirmation: text,
  // places
  lat: (v) => (lat(v) ? v : undefined),
  lng: (v) => (lng(v) ? v : undefined),
  color: (v) => (v === '' || isColor(v) ? v : undefined),
  category: oneOf(CATEGORIES.map((c) => c.id), true),
  sort_order: (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(Math.max(-1e9, Math.min(1e9, v))) : undefined),
  // legs
  mode: oneOf(MODES.map((m) => m.id)),
  from_lat: orNull(lat), from_lng: orNull(lng), to_lat: orNull(lat), to_lng: orNull(lng),
  from_tz: orNull((v) => typeof v === 'string' && validTz(v)),
  to_tz: orNull((v) => typeof v === 'string' && validTz(v)),
  // links
  place_id: orNull(id), from_place_id: orNull(id), to_place_id: orNull(id),
  // dates and times
  start_date: orNull(realDate), end_date: orNull(realDate), arrive_date: orNull(realDate), depart_date: orNull(realDate),
  arrive_time: orNull(realTime), depart_time: orNull(realTime),
  // checklist
  text,
  done: (v) => (v === true || v === 1 ? 1 : v === false || v === 0 ? 0 : undefined),
}

/** The cleaned value for `column`, `undefined` if it should be dropped, or the value itself for an unlisted column. */
export function clean(column: string, value: unknown): unknown {
  const fn = CLEANERS[column]
  return fn ? fn(value) : value
}

/** A mime type that is just `type/subtype`, else a harmless generic one. */
export const cleanMime = (v: unknown) =>
  typeof v === 'string' && /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i.test(v) ? v.toLowerCase() : 'application/octet-stream'

/** "YYYY-MM-DD HH:MM:SS" as the database writes timestamps, or null. */
export const cleanStamp = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? v : null)
