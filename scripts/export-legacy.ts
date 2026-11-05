/**
 * One-off: turn the old server-side SQLite database (data/trips.db + data/uploads/) into a backup .zip that the
 * app's "Import backup…" understands. Read-only; the database is not modified.
 *
 *   npm run export-legacy [path/to/trips.db] [output.zip]
 */
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { strToU8, zipSync } from 'fflate'

const dbPath = process.argv[2] ?? 'data/trips.db'
const out = process.argv[3] ?? join(dirname(dbPath), 'legacy-export.zip')
const uploads = join(dirname(dbPath), 'uploads')

if (!existsSync(dbPath)) {
  console.error(`No database at ${dbPath}`)
  process.exit(1)
}
const db = new DatabaseSync(dbPath, { readOnly: true })
type Row = Record<string, unknown>
const all = (sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as Row[]
const columns = (table: string) => new Set(all(`PRAGMA table_info(${table})`).map((c) => c.name as string))
// Databases from before soft deletes have no deleted_at column.
const live = (table: string) => (columns(table).has('deleted_at') ? ' AND deleted_at IS NULL' : '')

const files: Record<string, [Uint8Array, { level: 0 }]> = {}
const trips = all(`SELECT * FROM trips WHERE 1=1${live('trips')} ORDER BY id`).map((trip) => {
  const id = trip.id as number
  const places = all(`SELECT * FROM places WHERE trip_id = ?${live('places')} ORDER BY sort_order, id`, id)
  const legs = all(`SELECT * FROM legs WHERE trip_id = ?${live('legs')} ORDER BY id`, id)
  const placeIds = new Set(places.map((p) => p.id))
  const legIds = new Set(legs.map((l) => l.id))
  const notes = all(`SELECT * FROM notes WHERE trip_id = ?${live('notes')} ORDER BY id`, id)
  const items = all(`SELECT * FROM items WHERE trip_id = ?${live('items')} ORDER BY sort_order, id`, id).filter(
    (i) => i.place_id == null || placeIds.has(i.place_id),
  )
  const attachments = all(`SELECT * FROM attachments WHERE trip_id = ?${live('attachments')} ORDER BY id`, id)
    .filter((a) => (a.place_id == null || placeIds.has(a.place_id)) && (a.leg_id == null || legIds.has(a.leg_id)))
    .flatMap((a) => {
      const path = join(uploads, a.stored as string)
      if (!existsSync(path)) {
        console.warn(`Skipping missing file for attachment ${a.id} (${a.name})`)
        return []
      }
      const file = `files/${a.id}`
      files[file] = [new Uint8Array(readFileSync(path)), { level: 0 }]
      const { stored: _stored, ...meta } = a
      return [{ ...meta, file }]
    })
  return { trip, places, legs, notes, items, attachments }
})

const data = { format: 'trip-planner', version: 1, exported_at: new Date().toISOString(), trips }
writeFileSync(out, zipSync({ 'trip-planner.json': strToU8(JSON.stringify(data)), ...files }))

console.log(`Wrote ${out}`)
for (const t of trips) {
  console.log(`  ${t.trip.name}: ${t.places.length} places, ${t.legs.length} legs, ${t.notes.length} notes, ${t.items.length} checklist items, ${t.attachments.length} files`)
}
