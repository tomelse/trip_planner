import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

const file = process.env.DB_FILE ?? 'data/trips.db'
mkdirSync(dirname(file), { recursive: true })
export const uploadDir = join(dirname(file), 'uploads')
mkdirSync(uploadDir, { recursive: true })

export const db = new DatabaseSync(file)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    arrive_date TEXT,
    depart_date TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS legs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    mode TEXT NOT NULL DEFAULT 'flight',
    from_name TEXT NOT NULL DEFAULT '',
    from_place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
    from_lat REAL,
    from_lng REAL,
    to_name TEXT NOT NULL DEFAULT '',
    to_place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
    to_lat REAL,
    to_lng REAL,
    depart_date TEXT,
    depart_time TEXT,
    arrive_date TEXT,
    arrive_time TEXT,
    carrier TEXT NOT NULL DEFAULT '',
    number TEXT NOT NULL DEFAULT '',
    confirmation TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
    text TEXT NOT NULL DEFAULT '',
    done INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
    leg_id INTEGER REFERENCES legs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    stored TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

// Older database files predate later columns; add whatever is missing.
function addColumns(table: string, cols: Record<string, string>) {
  const have = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
  for (const [name, type] of Object.entries(cols)) {
    if (!have.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`)
  }
}
addColumns('places', {
  arrive_time: 'TEXT',
  depart_time: 'TEXT',
  address: "TEXT NOT NULL DEFAULT ''",
  category: "TEXT NOT NULL DEFAULT ''",
})
addColumns('legs', { from_lat: 'REAL', from_lng: 'REAL', to_lat: 'REAL', to_lng: 'REAL', from_tz: 'TEXT', to_tz: 'TEXT' })
// Deletes are soft so they can be undone; see purge().
for (const t of ['trips', 'places', 'legs', 'notes', 'items', 'attachments']) addColumns(t, { deleted_at: 'TEXT' })

type Row = Record<string, string | number | null>
export type Table = 'trips' | 'places' | 'notes' | 'legs' | 'items' | 'attachments'
export const tables: Table[] = ['trips', 'places', 'notes', 'legs', 'items', 'attachments']

const columns: Record<Table, string[]> = {
  trips: ['name', 'start_date', 'end_date'],
  places: ['name', 'address', 'lat', 'lng', 'notes', 'arrive_date', 'arrive_time', 'depart_date', 'depart_time', 'sort_order', 'color', 'category'],
  notes: ['title', 'body'],
  items: ['place_id', 'text', 'done', 'sort_order'],
  attachments: ['name'],
  legs: [
    'mode', 'from_name', 'from_place_id', 'from_lat', 'from_lng', 'to_name', 'to_place_id', 'to_lat', 'to_lng',
    'from_tz', 'to_tz', 'depart_date', 'depart_time', 'arrive_date', 'arrive_time',
    'carrier', 'number', 'confirmation', 'notes',
  ],
}

export function get(table: Table, id: number) {
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Row | undefined
}

export function listTrips() {
  return db.prepare('SELECT * FROM trips WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC').all()
}

const livePlaces = '(SELECT id FROM places WHERE deleted_at IS NULL)'
const liveLegs = '(SELECT id FROM legs WHERE deleted_at IS NULL)'

// Children of a soft-deleted place or leg are hidden rather than deleted, so restoring the parent restores them.
export function tripDetail(id: number) {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ? AND deleted_at IS NULL').get(id)
  if (!trip) return undefined
  const all = (sql: string) => db.prepare(sql).all(id)
  return {
    trip,
    places: all('SELECT * FROM places WHERE trip_id = ? AND deleted_at IS NULL ORDER BY sort_order, id'),
    notes: all('SELECT * FROM notes WHERE trip_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, id DESC'),
    legs: all(
      'SELECT * FROM legs WHERE trip_id = ? AND deleted_at IS NULL ORDER BY depart_date IS NULL, depart_date, depart_time, id',
    ),
    items: all(
      `SELECT * FROM items WHERE trip_id = ? AND deleted_at IS NULL AND (place_id IS NULL OR place_id IN ${livePlaces}) ORDER BY sort_order, id`,
    ),
    attachments: all(
      `SELECT id, trip_id, place_id, leg_id, name, mime, size, created_at FROM attachments
       WHERE trip_id = ? AND deleted_at IS NULL
         AND (place_id IS NULL OR place_id IN ${livePlaces})
         AND (leg_id IS NULL OR leg_id IN ${liveLegs})
       ORDER BY id`,
    ),
  }
}

const bind = (v: unknown) => (typeof v === 'boolean' ? Number(v) : v)

export function insert(table: Table, data: Record<string, unknown>, parent?: number) {
  const cols = columns[table].filter((c) => data[c] !== undefined)
  const names = parent === undefined ? cols : ['trip_id', ...cols]
  const vals = cols.map((c) => bind(data[c]))
  const values = parent === undefined ? vals : [parent, ...vals]
  const info = db
    .prepare(`INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`)
    .run(...(values as (string | number | null)[]))
  return get(table, Number(info.lastInsertRowid))!
}

export function update(table: Table, id: number, data: Record<string, unknown>) {
  const cols = columns[table].filter((c) => data[c] !== undefined)
  if (cols.length) {
    const extra = table === 'notes' ? ", updated_at = datetime('now')" : ''
    db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')}${extra} WHERE id = ?`).run(
      ...(cols.map((c) => bind(data[c])) as (string | number | null)[]),
      id,
    )
  }
  return get(table, id)
}

/** Soft delete: the row stays (hidden) until purge() so the delete can be undone. */
export function remove(table: Table, id: number) {
  db.prepare(`UPDATE ${table} SET deleted_at = datetime('now') WHERE id = ?`).run(id)
}

export function restore(table: Table, id: number) {
  db.prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`).run(id)
  return get(table, id)
}

export function insertAttachment(
  tripId: number,
  a: { place_id: number | null; leg_id: number | null; name: string; mime: string; size: number; stored: string },
) {
  const info = db
    .prepare('INSERT INTO attachments (trip_id, place_id, leg_id, name, mime, size, stored) VALUES (?,?,?,?,?,?,?)')
    .run(tripId, a.place_id, a.leg_id, a.name, a.mime, a.size, a.stored)
  return db
    .prepare('SELECT id, trip_id, place_id, leg_id, name, mime, size, created_at FROM attachments WHERE id = ?')
    .get(Number(info.lastInsertRowid))
}

export const attachmentFile = (id: number) =>
  db.prepare('SELECT name, mime, stored FROM attachments WHERE id = ? AND deleted_at IS NULL').get(id) as
    | { name: string; mime: string; stored: string }
    | undefined

const PURGE_AFTER = '-30 days'

/** Permanently drop things deleted more than 30 days ago, then any uploaded file no row points at. */
export function purge() {
  for (const t of ['attachments', 'items', 'legs', 'notes', 'places', 'trips']) {
    db.prepare(`DELETE FROM ${t} WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?)`).run(PURGE_AFTER)
  }
  const keep = new Set((db.prepare('SELECT stored FROM attachments').all() as { stored: string }[]).map((r) => r.stored))
  for (const f of readdirSync(uploadDir)) {
    const path = join(uploadDir, f)
    // The grace period avoids racing an upload whose row isn't inserted yet.
    if (!keep.has(f) && Date.now() - statSync(path).mtimeMs > 3_600_000) unlinkSync(path)
  }
}
