import { beforeEach, describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { freshDb } from './helpers'

let db: Awaited<ReturnType<typeof freshDb>>['db']
let backup: Awaited<ReturnType<typeof freshDb>>['backup']
beforeEach(async () => {
  ;({ db, backup } = await freshDb())
})

/** A trip with a place, a leg linking to it, a checklist item and a file on the place. */
async function sampleTrip() {
  const trip = await db.insert('trips', { name: 'NYC', start_date: '2026-04-01' })
  const tid = trip.id as number
  const place = await db.insert('places', { name: "Matt's House", address: '450 West 17th Street, New York, 10011, United States', lat: 40.743401, lng: -74.0054686, color: '#e03131' }, tid)
  await db.insert('legs', { from_place_id: place.id, to_name: 'JFK', depart_date: '2026-04-01', depart_time: '09:30' }, tid)
  await db.insert('items', { text: 'book', place_id: place.id }, tid)
  await db.insert('notes', { title: 'Pack', body: 'socks' }, tid)
  await db.addAttachment(tid, new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' }), { placeId: place.id })
  return tid
}

describe('export and import', () => {
  it('round-trips places, links, checklists and files, with coordinates and address untouched', async () => {
    const tid = await sampleTrip()
    const [copy] = await backup.importBackup(await backup.buildBackup([tid]))
    const orig = (await db.tripDetail(tid))!
    const got = (await db.tripDetail(copy))!

    expect(got.places[0]).toMatchObject({ lat: 40.743401, lng: -74.0054686, address: orig.places[0].address, name: orig.places[0].name, color: '#e03131' })
    expect([got.legs.length, got.notes.length, got.items.length, got.attachments.length]).toEqual([1, 1, 1, 1])
    // Ids are reassigned on import, so every link has to point at the copy, not the original.
    expect(got.legs[0].from_place_id).toBe(got.places[0].id)
    expect(got.legs[0].from_place_id).not.toBe(orig.places[0].id)
    expect(got.items[0].place_id).toBe(got.places[0].id)
    expect(got.attachments[0].place_id).toBe(got.places[0].id)
    expect((await db.getBlob(got.attachments[0].id))!.size).toBe(4)
  })

  it('survives a second export and import unchanged', async () => {
    const tid = await sampleTrip()
    const [first] = await backup.importBackup(await backup.buildBackup([tid]))
    const [second] = await backup.importBackup(await backup.buildBackup([first]))
    const a = (await db.tripDetail(first))!.places[0]
    const b = (await db.tripDetail(second))!.places[0]
    for (const f of ['lat', 'lng', 'address', 'name', 'color', 'category'] as const) expect(b[f]).toBe(a[f])
  })

  it('rejects anything that is not a trip backup', async () => {
    await expect(backup.importBackup(new Uint8Array([1, 2, 3]))).rejects.toThrow(/backup/)
    await expect(backup.importBackup(zipSync({ 'trip-planner.json': strToU8('{"format":"other"}') }))).rejects.toThrow(/not a trip planner backup/)
    await expect(backup.importBackup(zipSync({ 'x.txt': strToU8('hi') }))).rejects.toThrow(/no trip data/)
    const newer = JSON.stringify({ format: 'trip-planner', version: 99, trips: [] })
    await expect(backup.importBackup(zipSync({ 'trip-planner.json': strToU8(newer) }))).rejects.toThrow(/newer version/)
  })

  it('does not trust a backup file: bad values are dropped, markup in a colour never reaches the database', async () => {
    const hostile = {
      format: 'trip-planner', version: 1, exported_at: '',
      trips: [{
        trip: { name: 'Evil', start_date: '2026-02-31', created_at: 'yesterday' },
        places: [
          { id: 1, name: 'Fine', lat: 40.7, lng: -74, color: 'red;"><img src=x onerror=alert(1)>', notes: 'n'.repeat(100_000), sort_order: 'first' },
          { id: 2, name: 'Nowhere', lat: 999, lng: 0 },
          { id: 3, name: 'Also nowhere', lat: 'north', lng: 10 },
        ],
        legs: [{ id: 1, mode: 'rocket', from_tz: 'Not/AZone', from_place_id: 2, to_place_id: 1, depart_date: '1 April', depart_time: '9:30', from_lat: 500 }],
        notes: [], items: [{ id: 1, text: 'x', place_id: 2, done: 'yes' }],
        attachments: [{ id: 1, name: 'a.html', mime: 'text/html;<script>', file: 'files/1', place_id: 1 }],
      }],
    }
    const zip = zipSync({ 'trip-planner.json': strToU8(JSON.stringify(hostile)), 'files/1': strToU8('<script>alert(1)</script>') })
    const [id] = await backup.importBackup(zip)
    const d = (await db.tripDetail(id))!

    expect(d.trip.start_date).toBeNull()
    expect(d.places).toHaveLength(1) // the two with no usable coordinates are skipped
    expect(d.places[0].color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(d.places[0].notes.length).toBeLessThanOrEqual(20_000)
    expect(d.places[0].sort_order).toBe(0) // "first" is not a number, so the default applies
    expect(d.legs[0]).toMatchObject({ mode: 'flight', from_tz: null, depart_date: null, depart_time: null, from_lat: null, from_place_id: null })
    expect(d.legs[0].to_place_id).toBe(d.places[0].id)
    expect(d.items).toHaveLength(0) // it belonged to a place that did not come in
    expect(d.attachments[0].mime).toBe('application/octet-stream')
    expect((await db.getBlob(d.attachments[0].id))!.type).toBe('application/octet-stream')
  })

  it('is all or nothing: a failure part-way leaves nothing behind', async () => {
    const tid = await sampleTrip()
    const file = await backup.buildBackup([tid])
    const before = (await db.listTrips()).length

    // Make the database refuse to store a leg, after the trip and its places have already gone in.
    const proto = (globalThis as unknown as { IDBObjectStore: { prototype: { add: (...a: unknown[]) => unknown } } }).IDBObjectStore.prototype
    const realAdd = proto.add
    proto.add = function (this: { name: string }, ...args: unknown[]) {
      if (this.name === 'legs') throw new Error('disk full')
      return realAdd.apply(this, args)
    }
    try {
      await expect(backup.importBackup(file)).rejects.toThrow(/nothing was added/)
    } finally {
      proto.add = realAdd
    }

    expect(await db.listTrips()).toHaveLength(before)
    const { openDB } = await import('idb')
    const raw = await openDB('trip-planner')
    // Only the original trip's records remain: one place, one leg, one note, one item, one file.
    expect(await raw.count('places')).toBe(1)
    expect(await raw.count('attachments')).toBe(1)
    expect(await raw.count('blobs')).toBe(1)
  })
})
