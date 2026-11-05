import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers'

let db: Awaited<ReturnType<typeof freshDb>>['db']
beforeEach(async () => {
  ;({ db } = await freshDb())
})

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' })
const html = () => new File(['<script>alert(1)</script>'], 'x.html', { type: 'text/html' })

describe('records', () => {
  it('applies defaults and ignores columns it does not know', async () => {
    const trip = await db.insert('trips', { name: 'T' })
    const place = await db.insert('places', { name: 'Cafe', lat: 1, lng: 2, bogus: 'x' }, trip.id as number)
    expect(place).not.toHaveProperty('bogus')
    expect(place).toMatchObject({ notes: '', arrive_date: null, deleted_at: null })
  })

  it('stores booleans as numbers and merges updates', async () => {
    const trip = await db.insert('trips', { name: 'T' })
    const item = await db.insert('items', { text: 'book', done: false }, trip.id as number)
    expect(item.done).toBe(0)
    const place = await db.insert('places', { name: 'A', lat: 1, lng: 2 }, trip.id as number)
    await db.update('places', place.id, { name: 'B' })
    expect((await db.tripDetail(trip.id as number))!.places[0].name).toBe('B')
  })

  it('lists trips newest first and orders legs by departure', async () => {
    const a = await db.insert('trips', { name: 'A' })
    const b = await db.insert('trips', { name: 'B' })
    expect((await db.listTrips()).map((t) => t.id)).toEqual([b.id, a.id])
    await db.insert('legs', { depart_date: '2026-05-01' }, a.id as number)
    await db.insert('legs', { depart_date: '2026-04-01' }, a.id as number)
    await db.insert('legs', {}, a.id as number)
    const dates = (await db.tripDetail(a.id as number))!.legs.map((l) => l.depart_date)
    expect(dates).toEqual(['2026-04-01', '2026-05-01', null])
  })
})

describe('soft delete and undo', () => {
  it('hides a place together with its checklist and files, and brings them back on restore', async () => {
    const trip = await db.insert('trips', { name: 'T' })
    const tid = trip.id as number
    const place = await db.insert('places', { name: 'Cafe', lat: 1, lng: 2 }, tid)
    const leg = await db.insert('legs', { from_place_id: place.id }, tid)
    await db.insert('items', { text: 'book', place_id: place.id }, tid)
    await db.addAttachment(tid, png(), { placeId: place.id })
    await db.addAttachment(tid, html(), {})

    await db.remove('places', place.id)
    let d = (await db.tripDetail(tid))!
    expect([d.places.length, d.items.length, d.attachments.length]).toEqual([0, 0, 1])
    expect((d.legs[0] as { from_place_id: number }).from_place_id).toBe(place.id) // the link survives, for the undo

    await db.restore('places', place.id)
    d = (await db.tripDetail(tid))!
    expect([d.places.length, d.items.length, d.attachments.length]).toEqual([1, 1, 2])
    expect(leg.id).toBeDefined()
  })

  it('hides and restores a whole trip', async () => {
    const trip = await db.insert('trips', { name: 'T' })
    await db.remove('trips', trip.id)
    expect(await db.listTrips()).toHaveLength(0)
    expect(await db.tripDetail(trip.id as number)).toBeUndefined()
    await db.restore('trips', trip.id)
    expect(await db.listTrips()).toHaveLength(1)
  })
})

describe('files', () => {
  it('keeps an image typed as an image, and stores anything else as an opaque download', async () => {
    const trip = await db.insert('trips', { name: 'T' })
    const a = await db.addAttachment(trip.id as number, png(), {})
    const b = await db.addAttachment(trip.id as number, html(), {})
    expect((await db.getBlob(a.id))!.type).toBe('image/png')
    expect((await db.getBlob(b.id))!.type).toBe('application/octet-stream')
  })

  it('refuses files over the size limit', async () => {
    const trip = await db.insert('trips', { name: 'T' })
    const big = { size: db.MAX_FILE + 1, type: 'image/png', name: 'big.png' } as File
    await expect(db.addAttachment(trip.id as number, big, {})).rejects.toThrow(/too large/)
  })
})

describe('purge', () => {
  it('removes only things deleted more than 30 days ago, with their children and files', async () => {
    const trip = await db.insert('trips', { name: 'Old' })
    const tid = trip.id as number
    const place = await db.insert('places', { name: 'P', lat: 1, lng: 2 }, tid)
    await db.addAttachment(tid, png(), { placeId: place.id })
    const keep = await db.insert('places', { name: 'Recent', lat: 1, lng: 2 }, (await db.insert('trips', { name: 'Keep' })).id as number)

    await db.remove('trips', tid)
    await db.remove('places', keep.id)
    // Age the deleted trip by hand: it was deleted long ago.
    const { openDB } = await import('idb')
    const raw = await openDB('trip-planner')
    const row = await raw.get('trips', tid)
    row.deleted_at = '2020-01-01 00:00:00'
    await raw.put('trips', row)

    await db.purge()
    expect(await raw.get('trips', tid)).toBeUndefined()
    expect(await raw.getAllFromIndex('places', 'trip_id', tid)).toHaveLength(0)
    expect(await raw.getAllFromIndex('attachments', 'trip_id', tid)).toHaveLength(0)
    expect(await raw.getAllKeys('blobs')).toHaveLength(0)
    expect(await raw.get('places', keep.id)).toBeDefined() // a recent delete is still undoable
  })
})
