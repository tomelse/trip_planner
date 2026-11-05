import * as db from './db'
import { distanceKm, fetchImage, findCover, type CoverPhoto } from './photos'
import type { Place } from './types'

/** What the app knows about one place's photo. `loading` and `none` show nothing (apart from a placeholder while loading). */
export type CoverState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'ready'; blob: Blob; photo: Omit<CoverPhoto, 'imageUrl'> }

type PlaceKey = Pick<Place, 'id' | 'name' | 'lat' | 'lng'>

const KEY = 'trips:place-photos'
/** "Nothing found" is remembered this long before looking again (a found photo is kept until the place changes). */
const NONE_FOR_MS = 30 * 86_400_000
/** A moved pin only gets a new photo if it moved this far. */
const MOVED_KM = 0.3
/** Gap between lookups, so a trip full of places can't hammer Wikimedia. */
const SPACING_MS = 1000
/** After a failed lookup (offline, rate-limited), don't try the same place again for this long. */
const RETRY_AFTER_MS = 60_000

const norm = (s: string) => s.trim().toLowerCase()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function readEnabled() {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

/**
 * Photos for places, looked up from Wikipedia and Wikimedia when a place is shown, and kept on the device so each is
 * fetched once. Looking one up sends the place's name and position to Wikimedia, so it can be switched off.
 */
class Covers {
  enabled = $state(readEnabled())
  private states = $state<Record<number, CoverState>>({})
  /** What each state was worked out for, so a rename or a moved pin triggers a fresh look. */
  private known = new Map<number, { name: string; lat: number; lng: number; failedAt?: number }>()
  private inflight = new Map<number, Promise<void>>()
  private queue: Promise<unknown> = Promise.resolve()

  setEnabled(on: boolean) {
    this.enabled = on
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off')
    } catch {}
  }

  state(placeId: number): CoverState | undefined {
    return this.states[placeId]
  }

  /** Make sure this place's photo is known: from the device if it is there, else from Wikimedia (one at a time). */
  ensure(place: PlaceKey): Promise<void> {
    if (!this.enabled) return Promise.resolve()
    const k = this.known.get(place.id)
    const unchanged = k && norm(k.name) === norm(place.name) && distanceKm([k.lat, k.lng], [place.lat, place.lng]) < MOVED_KM
    if (unchanged) {
      if (k.failedAt === undefined) return this.inflight.get(place.id) ?? Promise.resolve() // known, or being looked up
      if (Date.now() - k.failedAt < RETRY_AFTER_MS) return Promise.resolve() // failed a moment ago: leave it
    }

    const mine = { name: place.name, lat: place.lat, lng: place.lng }
    this.known.set(place.id, mine)
    const job = this.resolve(place, mine).finally(() => this.inflight.delete(place.id))
    this.inflight.set(place.id, job)
    return job
  }

  private async resolve(place: PlaceKey, mine: { name: string; lat: number; lng: number; failedAt?: number }) {
    const current = () => this.known.get(place.id) === mine // false once the place was renamed or moved meanwhile
    try {
      const row = await db.getCover(place.id)
      if (row && norm(row.name) === norm(place.name) && distanceKm([row.lat, row.lng], [place.lat, place.lng]) < MOVED_KM) {
        if (row.blob && row.photo) return void (current() && (this.states[place.id] = { status: 'ready', blob: row.blob, photo: row.photo }))
        if (Date.now() - row.checked_at < NONE_FOR_MS) return void (current() && (this.states[place.id] = { status: 'none' }))
      }
      this.states[place.id] = { status: 'loading' }
      await this.queued(async () => {
        if (!current()) return
        const found = await findCover(place.name, place.lat, place.lng)
        if (!current()) return
        if (!found) {
          await db.putCover({ place_id: place.id, name: place.name, lat: place.lat, lng: place.lng, checked_at: Date.now() })
          this.states[place.id] = { status: 'none' }
          return
        }
        const blob = await fetchImage(found.imageUrl)
        const { imageUrl: _url, ...photo } = found
        await db.putCover({ place_id: place.id, name: place.name, lat: place.lat, lng: place.lng, checked_at: Date.now(), photo, blob })
        if (current()) this.states[place.id] = { status: 'ready', blob, photo }
      })
    } catch (e) {
      // Offline, rate-limited, or Wikimedia hiccuped: show nothing, and don't remember it as "no photo".
      console.warn('place photo', e)
      mine.failedAt = Date.now()
      if (current()) this.states[place.id] = { status: 'none' }
    }
  }

  /** Run network lookups one after another with a pause between, however many places ask at once. */
  private queued<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work)
    this.queue = run.then(() => sleep(SPACING_MS), () => sleep(SPACING_MS))
    return run
  }

  /**
   * The photo for a trip's banner: the first place (in list order) with a photo from its own article, else the
   * first with a neighbourhood photo.
   */
  banner(places: PlaceKey[]): (CoverState & { status: 'ready' }) | undefined {
    const ready = places.flatMap((p) => {
      const s = this.states[p.id]
      return s?.status === 'ready' ? [s] : []
    })
    return ready.find((s) => s.photo.kind === 'article') ?? ready[0]
  }

  /** Look up places in order until one with an article photo turns up (at most `limit`), to have a banner to show. */
  async warmBanner(places: PlaceKey[], limit = 6) {
    for (const p of places.slice(0, limit)) {
      await this.ensure(p)
      const s = this.states[p.id]
      if (s?.status === 'ready' && s.photo.kind === 'article') return
    }
  }
}

export const covers = new Covers()
