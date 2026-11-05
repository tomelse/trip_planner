import { openDB, type IDBPDatabase } from 'idb'
import { clean } from './clean'
import type { Attachment, TripDetail } from './types'

/**
 * The on-device database (IndexedDB). It plays the part the SQLite server used to: the same tables, defaults,
 * soft deletes and "children of a deleted parent are hidden" rule, so the rest of the app is unchanged.
 */

export type Table = 'trips' | 'places' | 'notes' | 'legs' | 'items' | 'attachments'
export const TABLES: Table[] = ['trips', 'places', 'notes', 'legs', 'items', 'attachments']

type Row = { id: number; deleted_at: string | null; [key: string]: unknown }

const nulls = (...names: string[]) => Object.fromEntries(names.map((n) => [n, null]))

/** Every writable column with its default; anything not listed here is ignored on write. */
const DEFAULTS: Record<Exclude<Table, 'attachments'>, Record<string, unknown>> = {
  trips: { name: '', ...nulls('start_date', 'end_date') },
  places: {
    name: '', address: '', category: '', lat: 0, lng: 0, notes: '', color: '', sort_order: 0,
    ...nulls('arrive_date', 'arrive_time', 'depart_date', 'depart_time'),
  },
  notes: { title: '', body: '' },
  legs: {
    mode: 'flight', from_name: '', to_name: '', carrier: '', number: '', confirmation: '', notes: '',
    ...nulls(
      'from_place_id', 'from_lat', 'from_lng', 'from_tz', 'to_place_id', 'to_lat', 'to_lng', 'to_tz',
      'depart_date', 'depart_time', 'arrive_date', 'arrive_time',
    ),
  },
  items: { place_id: null, text: '', done: 0, sort_order: 0 },
}
const WRITABLE: Record<Table, string[]> = {
  ...(Object.fromEntries(Object.entries(DEFAULTS).map(([t, d]) => [t, Object.keys(d)])) as Record<string, string[]>),
  attachments: ['name'],
} as Record<Table, string[]>

/** Everything in the database, for transactions that clean up across it. */
const ALL_STORES = [...TABLES, 'blobs', 'covers']

export const MAX_FILE = 50 * 1024 * 1024
/** Only these are ever displayed inline; everything else is downloaded, never rendered by the browser. */
export const INLINE_IMAGES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']
/** Remove a trip and everything in it for good (not the undoable delete): used to undo a half-finished import. */
export async function discardTrip(tripId: number) {
  const db = await getDb()
  const tx = db.transaction(ALL_STORES, 'readwrite')
  for (const key of await tx.objectStore('places').index('trip_id').getAllKeys(tripId)) await tx.objectStore('covers').delete(key)
  for (const t of ['places', 'legs', 'notes', 'items', 'attachments'] as const) {
    const store = tx.objectStore(t)
    for (const key of await store.index('trip_id').getAllKeys(tripId)) {
      await store.delete(key)
      if (t === 'attachments') await tx.objectStore('blobs').delete(key as number)
    }
  }
  await tx.objectStore('trips').delete(tripId)
  await tx.done
}

const PURGE_AFTER_DAYS = 30

/**
 * Schema changes, in order. Entry N upgrades a database from version N to N+1, and the database version is how many
 * there are, so a device on any older version runs exactly the steps it is missing. Never edit a step that has
 * shipped: add a new one.
 */
const MIGRATIONS: ((db: IDBPDatabase) => void)[] = [
  // 1: the original schema
  (db) => {
    for (const t of TABLES) {
      const store = db.createObjectStore(t, { keyPath: 'id', autoIncrement: true })
      if (t !== 'trips') store.createIndex('trip_id', 'trip_id')
    }
    db.createObjectStore('blobs') // attachment id -> Blob
  },
  // 2: place photos fetched from Wikipedia/Commons, kept so they work offline. A cache, keyed by place id.
  (db) => {
    db.createObjectStore('covers', { keyPath: 'place_id' })
  },
]

let dbPromise: Promise<IDBPDatabase> | undefined
function getDb() {
  dbPromise ??= openDB('trip-planner', MIGRATIONS.length, {
    upgrade(db, oldVersion) {
      for (let v = oldVersion; v < MIGRATIONS.length; v++) MIGRATIONS[v](db)
    },
    // Another window of the app (a newer version) wants to upgrade the database. Step aside so it can, and say so.
    blocking() {
      const stale = dbPromise
      dbPromise = undefined
      stale?.then((d) => d.close())
      globalThis.dispatchEvent?.(new Event('trip-db-outdated'))
    },
  })
  return dbPromise
}

/** "2026-11-05 10:21:03" in UTC: the same shape SQLite's datetime('now') produced, and it sorts as text. */
const stamp = (d = new Date()) => d.toISOString().slice(0, 19).replace('T', ' ')

/** The writable columns present in `data`, each cleaned; a value of the wrong shape is dropped (see clean.ts). */
const pick = (table: Table, data: Record<string, unknown>) =>
  Object.fromEntries(
    WRITABLE[table].flatMap((c) => {
      if (data[c] === undefined) return []
      const v = clean(c, data[c])
      return v === undefined ? [] : [[c, v]]
    }),
  )

const byId = (a: Row, b: Row) => a.id - b.id
const text = (v: unknown) => (typeof v === 'string' ? v : '')
const after = (a: unknown, b: unknown) => text(a).localeCompare(text(b))

export async function listTrips() {
  const rows = (await (await getDb()).getAll('trips')) as Row[]
  return rows
    .filter((t) => !t.deleted_at)
    .sort((a, b) => after(b.created_at, a.created_at) || b.id - a.id)
}

export async function tripDetail(id: number): Promise<TripDetail | undefined> {
  const db = await getDb()
  const trip = (await db.get('trips', id)) as Row | undefined
  if (!trip || trip.deleted_at) return undefined
  const children = async (t: Table) => ((await db.getAllFromIndex(t, 'trip_id', id)) as Row[]).filter((r) => !r.deleted_at)

  const [places, notes, legs, items, attachments] = await Promise.all(
    (['places', 'notes', 'legs', 'items', 'attachments'] as const).map(children),
  )
  // Children of a soft-deleted place or leg are hidden, not deleted, so restoring the parent restores them.
  const placeIds = new Set(places.map((p) => p.id))
  const legIds = new Set(legs.map((l) => l.id))
  const inPlace = (r: Row) => r.place_id == null || placeIds.has(r.place_id as number)

  return {
    trip,
    places: places.sort((a, b) => (a.sort_order as number) - (b.sort_order as number) || byId(a, b)),
    notes: notes.sort((a, b) => after(b.updated_at, a.updated_at) || b.id - a.id),
    legs: legs.sort(
      (a, b) =>
        Number(a.depart_date == null) - Number(b.depart_date == null) ||
        after(a.depart_date, b.depart_date) ||
        after(a.depart_time, b.depart_time) ||
        byId(a, b),
    ),
    items: items.filter(inPlace).sort((a, b) => (a.sort_order as number) - (b.sort_order as number) || byId(a, b)),
    attachments: attachments.filter((a) => inPlace(a) && (a.leg_id == null || legIds.has(a.leg_id as number))).sort(byId),
  } as unknown as TripDetail
}

export async function insert(
  table: Exclude<Table, 'attachments'>,
  data: Record<string, unknown>,
  tripId?: number,
  /** Raw fields kept as given (timestamps from an import). */
  raw: Record<string, unknown> = {},
) {
  const db = await getDb()
  const row: Record<string, unknown> = {
    ...DEFAULTS[table],
    ...pick(table, data),
    ...(tripId === undefined ? {} : { trip_id: tripId }),
    ...(table === 'trips' ? { created_at: stamp() } : {}),
    ...(table === 'notes' ? { updated_at: stamp() } : {}),
    ...raw,
    deleted_at: null,
  }
  const id = (await db.add(table, row)) as number
  return { ...row, id } as Row
}

export async function update(table: Table, id: number, data: Record<string, unknown>) {
  const db = await getDb()
  const row = (await db.get(table, id)) as Row | undefined
  if (!row) throw new Error('not found')
  Object.assign(row, pick(table, data))
  if (table === 'notes') row.updated_at = stamp()
  await db.put(table, row)
  return row
}

async function setDeleted(table: Table, id: number, value: string | null) {
  const db = await getDb()
  const row = (await db.get(table, id)) as Row | undefined
  if (!row) throw new Error('not found')
  row.deleted_at = value
  await db.put(table, row)
  return row
}

/** Soft delete: the row stays (hidden) until purge() so the delete can be undone. */
export const remove = (table: Table, id: number) => setDeleted(table, id, stamp())
export const restore = (table: Table, id: number) => setDeleted(table, id, null)

// ---- files

export async function addAttachment(
  tripId: number,
  file: File,
  target: { placeId?: number; legId?: number },
): Promise<Attachment> {
  if (file.size > MAX_FILE) throw new Error('file too large (50 MB max)')
  const db = await getDb()
  const mime = (file.type || 'application/octet-stream').split(';')[0].trim().toLowerCase()
  const meta = {
    trip_id: tripId,
    place_id: target.placeId ?? null,
    leg_id: target.legId ?? null,
    name: (file.name || 'file').slice(0, 200),
    mime,
    size: file.size,
    created_at: stamp(),
    deleted_at: null,
  }
  const tx = db.transaction(['attachments', 'blobs'], 'readwrite')
  const id = (await tx.objectStore('attachments').add(meta)) as number
  await tx.objectStore('blobs').put(new Blob([file], { type: INLINE_IMAGES.includes(mime) ? mime : 'application/octet-stream' }), id)
  await tx.done
  return { ...meta, id } as unknown as Attachment
}

export async function getBlob(id: number): Promise<Blob | undefined> {
  return (await getDb()).get('blobs', id)
}

export async function putAttachmentRecord(meta: Record<string, unknown>, blob: Blob | undefined) {
  const db = await getDb()
  const tx = db.transaction(['attachments', 'blobs'], 'readwrite')
  const id = (await tx.objectStore('attachments').add({ ...meta, deleted_at: null })) as number
  if (blob) await tx.objectStore('blobs').put(blob, id)
  await tx.done
  return id
}

// ---- housekeeping

/** Permanently drop things deleted more than 30 days ago, along with their children and files. */
export async function purge() {
  const db = await getDb()
  const cutoff = stamp(new Date(Date.now() - PURGE_AFTER_DAYS * 86_400_000))
  const old = async (t: Table) => ((await db.getAll(t)) as Row[]).filter((r) => r.deleted_at && r.deleted_at < cutoff)

  const [trips, places, legs] = await Promise.all([old('trips'), old('places'), old('legs')])
  const gone = {
    trips: new Set(trips.map((r) => r.id)),
    places: new Set(places.map((r) => r.id)),
    legs: new Set(legs.map((r) => r.id)),
  }
  const doomed = new Map<Table, Set<number>>(TABLES.map((t) => [t, new Set<number>()]))
  for (const [t, ids] of [['trips', gone.trips], ['places', gone.places], ['legs', gone.legs]] as const) {
    for (const id of ids) doomed.get(t)!.add(id)
  }
  for (const t of ['notes', 'items', 'attachments'] as const) {
    for (const r of (await db.getAll(t)) as Row[]) {
      const expired = r.deleted_at && r.deleted_at < cutoff
      const orphan =
        gone.trips.has(r.trip_id as number) || gone.places.has(r.place_id as number) || gone.legs.has(r.leg_id as number)
      if (expired || orphan) doomed.get(t)!.add(r.id)
    }
  }
  // Places and legs of a purged trip go too; legs that pointed at a purged place just lose the link.
  for (const t of ['places', 'legs'] as const) {
    for (const r of (await db.getAll(t)) as Row[]) if (gone.trips.has(r.trip_id as number)) doomed.get(t)!.add(r.id)
  }
  const stale = ((await db.getAll('legs')) as Row[]).filter(
    (l) => gone.places.has(l.from_place_id as number) || gone.places.has(l.to_place_id as number),
  )

  const tx = db.transaction(ALL_STORES, 'readwrite')
  for (const l of stale) {
    if (doomed.get('legs')!.has(l.id)) continue
    if (gone.places.has(l.from_place_id as number)) l.from_place_id = null
    if (gone.places.has(l.to_place_id as number)) l.to_place_id = null
    await tx.objectStore('legs').put(l)
  }
  for (const [t, ids] of doomed) {
    for (const id of ids) {
      await tx.objectStore(t).delete(id)
      if (t === 'attachments') await tx.objectStore('blobs').delete(id)
    }
  }
  // A cached photo whose place is gone is just clutter.
  const livePlaceIds = new Set(await tx.objectStore('places').getAllKeys())
  for (const key of await tx.objectStore('covers').getAllKeys()) if (!livePlaceIds.has(key as number)) await tx.objectStore('covers').delete(key)
  await tx.done
}

// ---- place photos (a cache; see photos.ts)

/** What was found for one place, kept with the image so it shows offline. `blob` is absent when nothing was found. */
export interface CoverRow {
  place_id: number
  /** What it was looked up for: the cached result only counts while the place still has this name and position. */
  name: string
  lat: number
  lng: number
  checked_at: number
  photo?: { kind: 'article' | 'neighbourhood'; subject: string; width: number; height: number; credit: { author: string; license: string; licenseUrl?: string; pageUrl: string; from: string } }
  blob?: Blob
}

export async function getCover(placeId: number): Promise<CoverRow | undefined> {
  return (await getDb()).get('covers', placeId)
}

export async function putCover(row: CoverRow) {
  await (await getDb()).put('covers', row)
}
