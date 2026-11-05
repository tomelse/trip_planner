import { beforeEach, describe, expect, it, vi } from 'vitest'
import { freshDb } from './helpers'

let db: Awaited<ReturnType<typeof freshDb>>['db']
let store: typeof import('../src/lib/store.svelte').store
let api: typeof import('../src/lib/api').api

beforeEach(async () => {
  ;({ db } = await freshDb())
  ;({ store } = await import('../src/lib/store.svelte'))
  ;({ api } = await import('../src/lib/api'))
  await store.createTrip('Trip')
  await store.addPlace(40.7, -74, 'Cafe', '1 Main St') // a name and address given, so nothing is looked up
})

const saved = async () => (await db.tripDetail(store.current!.trip.id))!.places[0]

describe('saving edits', () => {
  it('writes edits straight away when flushed, merging several into one save', async () => {
    const id = store.current!.places[0].id
    const spy = vi.spyOn(api, 'patchPlace')
    store.patchPlace(id, { name: 'Cafe 2' })
    store.patchPlace(id, { notes: 'open late' })
    await store.flush()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(await saved()).toMatchObject({ name: 'Cafe 2', notes: 'open late' })
  })

  it('shows the edit at once, before it is written', () => {
    const id = store.current!.places[0].id
    store.patchPlace(id, { name: 'Instant' })
    expect(store.current!.places[0].name).toBe('Instant')
  })

  it('tells you when a save fails, keeps the edit, and writes it on the next attempt', async () => {
    const id = store.current!.places[0].id
    vi.spyOn(api, 'patchPlace').mockRejectedValueOnce(new Error('QuotaExceededError'))
    store.patchPlace(id, { name: 'Lost?' })
    await store.flush()

    expect(store.toast?.message).toMatch(/Couldn’t save/)
    expect((await saved()).name).toBe('Cafe') // not written yet...

    await store.flush() // ...but still queued, so the next flush (switching trips, hiding the app) retries
    expect((await saved()).name).toBe('Lost?')
  })

  it('lets a newer edit win over a failed older one', async () => {
    const id = store.current!.places[0].id
    vi.spyOn(api, 'patchPlace').mockRejectedValueOnce(new Error('boom'))
    store.patchPlace(id, { name: 'old', notes: 'keep' })
    await store.flush()
    store.patchPlace(id, { name: 'new' })
    await store.flush()
    expect(await saved()).toMatchObject({ name: 'new', notes: 'keep' })
  })
})

describe('undoing a delete', () => {
  it('brings a removed place back, with its checklist', async () => {
    const id = store.current!.places[0].id
    await store.addItem(id, 'book a table')
    await store.deletePlace(id)
    expect(store.current!.places).toHaveLength(0)
    expect(store.toast?.undo).toBeTypeOf('function')
    await store.undo()
    expect(store.current!.places).toHaveLength(1)
    expect(store.current!.items).toHaveLength(1)
  })
})
