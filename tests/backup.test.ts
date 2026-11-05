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
})
