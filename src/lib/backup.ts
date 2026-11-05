import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import * as db from './db'
import { clean, cleanMime, cleanStamp, isColor } from './clean'
import { PALETTE } from './palette'
import type { Attachment, ChecklistItem, Leg, Note, Place, Trip } from './types'

/**
 * Backups are a .zip holding `trip-planner.json` plus the attached files under `files/`.
 * Importing always adds new trips; it never overwrites or merges with what is already on the device.
 */

export const FORMAT = 'trip-planner'
export const VERSION = 1
const JSON_NAME = 'trip-planner.json'

export interface ExportedTrip {
  trip: Trip
  places: Place[]
  legs: Leg[]
  notes: Note[]
  items: ChecklistItem[]
  /** `file` is the path of the attachment inside the zip. */
  attachments: (Attachment & { file: string })[]
}

export interface ExportFile {
  format: typeof FORMAT
  version: typeof VERSION
  exported_at: string
  trips: ExportedTrip[]
}

/** `created_at` as the database writes it, or nothing (the new trip is then dated now). */
const createdAt = (v: unknown) => {
  const stamp = cleanStamp(v)
  return stamp ? { created_at: stamp } : {}
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const arr = (v: unknown) => (Array.isArray(v) ? v.filter(isRecord) : [])
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Zip up some trips (default: all) with their files. */
export async function buildBackup(tripIds?: number[]): Promise<Uint8Array> {
  const ids = tripIds ?? (await db.listTrips()).map((t) => t.id as number)
  const files: Record<string, [Uint8Array, { level: 0 }]> = {}
  const trips: ExportedTrip[] = []

  for (const id of ids) {
    const d = await db.tripDetail(id)
    if (!d) continue
    const attachments: ExportedTrip['attachments'] = []
    for (const a of d.attachments) {
      const blob = await db.getBlob(a.id)
      if (!blob) continue
      const file = `files/${a.id}`
      files[file] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }] // photos are already compressed
      attachments.push({ ...a, file })
    }
    trips.push({ trip: d.trip, places: d.places, legs: d.legs, notes: d.notes, items: d.items, attachments })
  }

  const data: ExportFile = { format: FORMAT, version: VERSION, exported_at: new Date().toISOString(), trips }
  return zipSync({ [JSON_NAME]: strToU8(JSON.stringify(data)), ...files })
}

/** Add the trips in a backup to this device. Returns the new trip ids, in file order. */
export async function importBackup(bytes: Uint8Array): Promise<number[]> {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    throw new Error('That does not look like a trip backup (.zip).')
  }
  const raw = entries[JSON_NAME]
  if (!raw) throw new Error('That zip has no trip data in it.')
  const data = JSON.parse(strFromU8(raw)) as unknown
  if (!isRecord(data) || data.format !== FORMAT) throw new Error('That is not a trip planner backup.')
  if (typeof data.version !== 'number' || data.version > VERSION) {
    throw new Error('That backup was made by a newer version of the app.')
  }

  const created: number[] = []
  try {
    for (const t of arr(data.trips)) {
      if (!isRecord(t.trip)) continue
      const trip = await db.insert('trips', t.trip, undefined, createdAt(t.trip.created_at))
      const tripId = trip.id
      created.push(tripId)

      // Ids are reassigned on the way in, so links between records have to be remapped.
      const placeIds = new Map<number, number>()
      for (const [i, p] of arr(t.places).entries()) {
        // A place without real coordinates can't go on a map (and would otherwise land at 0, 0).
        if (clean('lat', p.lat) === undefined || clean('lng', p.lng) === undefined) continue
        // A colour that isn't a plain hex code is replaced from the palette; it ends up in HTML and CSS.
        const made = await db.insert('places', { ...p, color: isColor(p.color) ? p.color : PALETTE[i % PALETTE.length] }, tripId)
        if (num(p.id) !== null) placeIds.set(p.id as number, made.id)
      }
      const legIds = new Map<number, number>()
      for (const l of arr(t.legs)) {
        const link = (v: unknown) => (num(v) !== null ? (placeIds.get(v as number) ?? null) : null)
        const made = await db.insert('legs', { ...l, from_place_id: link(l.from_place_id), to_place_id: link(l.to_place_id) }, tripId)
        if (num(l.id) !== null) legIds.set(l.id as number, made.id)
      }
      for (const n of arr(t.notes)) {
        const stamp = cleanStamp(n.updated_at)
        await db.insert('notes', n, tripId, stamp ? { updated_at: stamp } : {})
      }
      for (const i of arr(t.items)) {
        const place = num(i.place_id) !== null ? placeIds.get(i.place_id as number) : undefined
        if (num(i.place_id) !== null && place === undefined) continue // belonged to a place that isn't in the file
        await db.insert('items', { ...i, place_id: place ?? null }, tripId)
      }
      for (const a of arr(t.attachments)) {
        const bytes = typeof a.file === 'string' ? entries[a.file] : undefined
        if (!bytes) continue
        const mime = cleanMime(a.mime)
        const blob = new Blob([bytes as BlobPart], { type: db.INLINE_IMAGES.includes(mime) ? mime : 'application/octet-stream' })
        const place = num(a.place_id) !== null ? placeIds.get(a.place_id as number) : undefined
        const leg = num(a.leg_id) !== null ? legIds.get(a.leg_id as number) : undefined
        if ((num(a.place_id) !== null && place === undefined) || (num(a.leg_id) !== null && leg === undefined)) continue
        await db.putAttachmentRecord(
          {
            trip_id: tripId,
            place_id: place ?? null,
            leg_id: leg ?? null,
            name: typeof a.name === 'string' ? a.name.slice(0, 200) : 'file',
            mime,
            size: bytes.byteLength,
            created_at: cleanStamp(a.created_at) ?? new Date().toISOString().slice(0, 19).replace('T', ' '),
          },
          blob,
        )
      }
    }
  } catch (e) {
    // All or nothing: a half-imported trip is worse than none.
    for (const id of created) await db.discardTrip(id).catch(() => {})
    throw new Error(`Import failed, nothing was added (${e instanceof Error ? e.message : e}).`)
  }
  return created
}

export function download(bytes: Uint8Array | Blob, filename: string) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const safeName = (s: string) => s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'trip'
