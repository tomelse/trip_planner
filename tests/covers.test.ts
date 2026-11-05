import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { CoverPhoto } from '../src/lib/photos'

const photo = (kind: 'article' | 'neighbourhood' = 'article', subject = 'Statue of Liberty'): CoverPhoto => ({
  kind, subject, imageUrl: 'https://upload.wikimedia.org/x.jpg', width: 800, height: 600,
  credit: { author: 'AskALotl', license: 'CC0', pageUrl: 'https://commons.wikimedia.org/wiki/File:x.jpg', from: 'Wikimedia Commons' },
})
const place = (id: number, o: Partial<{ name: string; lat: number; lng: number }> = {}) => ({ id, name: `Place ${id}`, lat: 40.689, lng: -74.044, ...o })
const image = () => new Blob([new Uint8Array(50)], { type: 'image/jpeg' })

let findCover: Mock<(...args: any[]) => unknown>
let fetchImage: Mock<(...args: any[]) => unknown>
const storage = new Map<string, string>()

/** A fresh copy of the store (as after reloading the app); the database is kept unless `wipe` is set. */
async function load(wipe = false) {
  if (wipe) globalThis.indexedDB = new IDBFactory()
  vi.resetModules()
  findCover ??= vi.fn()
  fetchImage ??= vi.fn()
  vi.doMock('../src/lib/photos', async (orig) => ({ ...(await orig<typeof import('../src/lib/photos')>()), findCover: (...a: unknown[]) => findCover(...a), fetchImage: (...a: unknown[]) => fetchImage(...a) }))
  return (await import('../src/lib/covers.svelte')).covers
}

/**
 * Let queued lookups run. They pause a second between each (on the fake clock), and the fake database needs real
 * turns of the event loop to answer, so alternate between the two.
 */
const turn = () => new Promise<void>((r) => setImmediate(r))
const settle = async (rounds = 8) => {
  for (let i = 0; i < rounds; i++) {
    for (let j = 0; j < 25; j++) await turn()
    await vi.advanceTimersByTimeAsync(1100)
  }
}

beforeEach(() => {
  findCover = vi.fn(async () => photo())
  fetchImage = vi.fn(async () => image())
  storage.clear()
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) })
  // Only the clock and timeouts are faked, so the fake IndexedDB keeps working.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
  return () => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.doUnmock('../src/lib/photos')
  }
})

describe('looking a photo up', () => {
  it('finds it once, then reads it from the device, even after a reload', async () => {
    let covers = await load(true)
    const done = covers.ensure(place(1))
    expect([undefined, 'loading']).toContain(covers.state(1)?.status) // nothing to show yet
    await settle()
    await done
    expect(covers.state(1)).toMatchObject({ status: 'ready', photo: { kind: 'article', subject: 'Statue of Liberty' } })
    expect(findCover).toHaveBeenCalledTimes(1)

    await covers.ensure(place(1)) // same place again: nothing to do
    expect(findCover).toHaveBeenCalledTimes(1)

    covers = await load() // "reload": a new store, the same database
    await covers.ensure(place(1))
    expect(covers.state(1)).toMatchObject({ status: 'ready' })
    expect(findCover).toHaveBeenCalledTimes(1) // not asked again
  })

  it('does not keep the image URL, only the image itself and its credit', async () => {
    const covers = await load(true)
    const done = covers.ensure(place(1))
    await settle()
    await done
    const s = covers.state(1)
    expect(s?.status === 'ready' && 'imageUrl' in s.photo).toBe(false)
  })

  it('remembers "no photo" for a month, then looks again', async () => {
    findCover.mockResolvedValue(null)
    let covers = await load(true)
    const done = covers.ensure(place(1))
    await settle()
    await done
    expect(covers.state(1)).toEqual({ status: 'none' })

    covers = await load()
    await covers.ensure(place(1))
    expect(findCover).toHaveBeenCalledTimes(1) // still within the month

    vi.setSystemTime(new Date('2026-07-05T12:00:00Z'))
    covers = await load()
    const again = covers.ensure(place(1))
    await settle()
    await again
    expect(findCover).toHaveBeenCalledTimes(2)
  })

  it('looks again when the place is renamed or moved a long way, but not for a small nudge', async () => {
    const covers = await load(true)
    for (const p of [place(1), place(1, { name: 'Liberty Island' }), place(1, { name: 'Liberty Island', lat: 40.6893 }), place(1, { name: 'Liberty Island', lat: 40.75 })]) {
      const d = covers.ensure(p)
      await settle()
      await d
    }
    // original, renamed, a 40 m nudge (ignored), then ~7 km away
    expect(findCover).toHaveBeenCalledTimes(3)
  })

  it('does nothing while switched off, and remembers the setting', async () => {
    let covers = await load(true)
    covers.setEnabled(false)
    await covers.ensure(place(1))
    expect(findCover).not.toHaveBeenCalled()
    expect(covers.state(1)).toBeUndefined()
    expect(storage.get('trips:place-photos')).toBe('off')
    covers = await load()
    expect(covers.enabled).toBe(false)
    covers.setEnabled(true)
    expect(covers.enabled).toBe(true)
  })
})

describe('when it goes wrong', () => {
  it('shows nothing, does not remember it as "no photo", and leaves the place alone for a minute', async () => {
    findCover.mockRejectedValueOnce(new Error('offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const covers = await load(true)
    const first = covers.ensure(place(1))
    await settle()
    await first
    expect(covers.state(1)).toEqual({ status: 'none' })

    await covers.ensure(place(1)) // straight away: not retried
    expect(findCover).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date('2026-06-01T12:02:00Z'))
    const retry = covers.ensure(place(1))
    await settle()
    await retry
    expect(covers.state(1)).toMatchObject({ status: 'ready' }) // the retry worked, and nothing wrong was cached
  })

  it('spaces lookups out, however many places ask at once', async () => {
    const starts: number[] = []
    findCover.mockImplementation(async () => {
      starts.push(Date.now())
      return photo()
    })
    const covers = await load(true)
    const all = Promise.all([covers.ensure(place(1)), covers.ensure(place(2, { name: 'B' })), covers.ensure(place(3, { name: 'C' }))])
    await settle()
    await all
    expect(starts).toHaveLength(3)
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000)
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(1000)
  })
})

describe('the trip banner', () => {
  it("prefers a place's own article photo over a neighbourhood one, in list order", async () => {
    findCover.mockImplementation(async (name: string) => (name === 'Home' ? photo('neighbourhood', 'Chelsea, Manhattan') : name === 'Nowhere' ? null : photo('article', name)))
    const covers = await load(true)
    const places = [place(1, { name: 'Home' }), place(2, { name: 'Nowhere' }), place(3, { name: 'Statue of Liberty' }), place(4, { name: 'Central Park' })]
    expect(covers.banner(places)).toBeUndefined() // nothing known yet
    const done = covers.warmBanner(places)
    await settle()
    await done
    expect(covers.banner(places)?.photo.subject).toBe('Statue of Liberty')
    expect(findCover).toHaveBeenCalledTimes(3) // stops once it has an article photo; never looks up Central Park
  })

  it('falls back to a neighbourhood photo, and gives up after a handful of places', async () => {
    findCover.mockResolvedValue(photo('neighbourhood', 'Chelsea, Manhattan'))
    const covers = await load(true)
    const places = Array.from({ length: 10 }, (_, i) => place(i + 1, { name: `P${i}` }))
    const done = covers.warmBanner(places)
    await settle(12)
    await done
    expect(covers.banner(places)?.photo.subject).toBe('Chelsea, Manhattan')
    expect(findCover).toHaveBeenCalledTimes(6) // the limit
  })
})
