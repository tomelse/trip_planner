import { api } from './api'
import * as db from './db'
import { shrinkImage } from './files'
import { backupStatus, noteFirstUse, type BackupStatus } from './backupStatus'
import { addDays, iso, parse } from './dates'
import { reverse } from './geo'
import { Focus } from './focus.svelte'
import type { Shared } from './share'
import { nextColor } from './palette'
import { findIssues, type Issue } from './issues'
import type { Attachment, ChecklistItem, Leg, Note, Place, Trip, TripDetail } from './types'

export type Tab = 'places' | 'travel' | 'calendar' | 'notes'

const LAST_TRIP_KEY = 'trips:last'

type SaveKind = 'trip' | 'place' | 'note' | 'leg' | 'item'
const SAVE: Record<SaveKind, (id: number, patch: never) => Promise<unknown>> = {
  trip: (id, patch) => api.patchTrip(id, patch),
  place: (id, patch) => api.patchPlace(id, patch),
  note: (id, patch) => api.patchNote(id, patch),
  leg: (id, patch) => api.patchLeg(id, patch),
  item: (id, patch) => api.patchItem(id, patch),
}

class Store {
  trips = $state<Trip[]>([])
  current = $state<TripDetail | null>(null)
  /** Hover and selection, shared by every list, the calendar and the map. */
  focus = new Focus(
    () => this.current,
    (ref) => (this.tab = ref.type === 'leg' ? 'travel' : 'places'),
  )
  tab = $state<Tab>('places')
  /** Narrow screens only: give the map most of the height instead of the list. */
  mapExpanded = $state(false)
  /** The new-trip / trip-details dialog, when open. */
  tripDialog = $state<'new' | 'edit' | null>(null)
  /** Open menus on the map. Held here so the Back button can close them. */
  /** A place shared into the app, waiting for you to confirm where it is. */
  shared = $state<Shared | null>(null)
  tripMenuOpen = $state(false)
  /** Whether a backup is overdue, and how long ago the last one was. */
  backup = $state<BackupStatus>({ due: false, label: '' })
  layersOpen = $state(false)
  error = $state<string | null>(null)
  /** Category chip selected in the Places tab; hides other places in the list and dims them on the map. */
  categoryFilter = $state<string | null>(null)
  /** Transient message, with an Undo action after a delete. */
  toast = $state<{ message: string; undo: (() => Promise<void>) | null; label: string } | null>(null)
  /** Things in the plan that can't work (reversed times, overlapping legs, ...). */
  issues = $derived<Issue[]>(this.current ? findIssues(this.current) : [])

  private toastTimer: ReturnType<typeof setTimeout> | undefined

  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private pending = new Map<string, Record<string, unknown>>()

  async init() {
    try {
      // Ask the browser not to clear our data under storage pressure (granted for installed apps, mostly).
      navigator.storage?.persist?.().catch(() => {})
      await db.purge()
      this.trips = await api.trips()
      if (this.trips.length) noteFirstUse()
      this.refreshBackup()
      const last = Number(localStorage.getItem(LAST_TRIP_KEY))
      const first = this.trips.find((t) => t.id === last) ?? this.trips[0]
      if (first) await this.openTrip(first.id)
    } catch (e) {
      this.error = 'Could not open the on-device database. Private browsing or blocked site data can cause this.'
      console.error(e)
    }
  }

  async openTrip(id: number) {
    await this.flush()
    this.current = await api.trip(id)
    this.focus.reset()
    this.categoryFilter = null
    try {
      localStorage.setItem(LAST_TRIP_KEY, String(id))
    } catch {}
  }

  async createTrip(name: string, start_date: string | null = null, end_date: string | null = null) {
    const trip = await api.createTrip({ name: name.trim() || 'Untitled trip', start_date, end_date })
    this.trips = [trip, ...this.trips]
    await this.openTrip(trip.id)
  }

  patchTrip(patch: Partial<Trip>) {
    const t = this.current?.trip
    if (!t) return
    Object.assign(t, patch)
    const i = this.trips.findIndex((x) => x.id === t.id)
    if (i >= 0) Object.assign(this.trips[i], patch)
    this.queue('trip', t.id, patch)
  }

  async deleteTrip() {
    const t = this.current?.trip
    if (!t) return
    await this.flush()
    await api.deleteTrip(t.id)
    this.trips = this.trips.filter((x) => x.id !== t.id)
    this.current = null
    if (this.trips[0]) await this.openTrip(this.trips[0].id)
    this.notify(`Deleted “${t.name}”`, async () => {
      await api.restore('trips', t.id)
      this.trips = await api.trips()
      await this.openTrip(t.id)
    })
  }

  refreshBackup() {
    this.backup = backupStatus(this.trips.length > 0)
  }

  /** Show a message for a few seconds; with `undo`, the toast offers to reverse the delete. */
  notify(message: string, undo: (() => Promise<void>) | null = null, label = 'Undo') {
    clearTimeout(this.toastTimer)
    this.toast = { message, undo, label }
    // Undo is time-boxed; the update prompt stays longer, and is offered again when the app next comes into view.
    this.toastTimer = setTimeout(() => (this.toast = null), !undo ? 5_000 : label === 'Undo' ? 10_000 : 30_000)
  }

  /** After importing a backup: refresh the trip list and open the first trip that came in. */
  async afterImport(ids: number[]) {
    this.trips = await api.trips()
    if (ids[0] !== undefined) await this.openTrip(ids[0])
  }

  async undo() {
    const t = this.toast
    if (!t?.undo) return
    clearTimeout(this.toastTimer)
    this.toast = null
    await t.undo().catch((e) => this.notify(`Undo failed: ${e}`))
  }

  /** Refetch the open trip without losing the current selection (used after undo). */
  async reload() {
    const id = this.current?.trip.id
    if (id === undefined) return
    await this.flush()
    this.current = await api.trip(id)
  }

  issuesFor(type: 'leg' | 'place', id: number) {
    return this.issues.filter((i) => i.ref.type === type && i.ref.id === id)
  }

  async addPlace(lat: number, lng: number, name?: string, address = '') {
    const d = this.current
    if (!d) return
    const fallback = name ?? `${lat.toFixed(3)}, ${lng.toFixed(3)}`
    const place = await api.createPlace(d.trip.id, {
      name: fallback,
      address,
      lat,
      lng,
      color: nextColor(d.places),
      sort_order: d.places.reduce((m, p) => Math.max(m, p.sort_order), 0) + 1,
    })
    d.places.push(place)
    this.focus.select({ type: 'place', id: place.id })
    if (!name || !address) {
      const resolved = await reverse(lat, lng)
      const live = d.places.find((p) => p.id === place.id)
      if (!resolved || !live) return
      // Never clobber a name the user has already typed.
      const patch: Partial<Place> = {}
      if (!name && live.name === fallback) patch.name = resolved.name
      if (!address && !live.address) patch.address = resolved.address
      if (Object.keys(patch).length) this.patchPlace(place.id, patch)
    }
  }

  /**
   * The address of the building nearest a place's pin, without applying it. That is the nearest building, not
   * necessarily the right one: a pin on 450 West 17th St can come back as number 434.
   */
  async nearestAddress(id: number): Promise<string | null> {
    const p = this.current?.places.find((x) => x.id === id)
    if (!p) return null
    return (await reverse(p.lat, p.lng))?.address ?? null
  }

  patchPlace(id: number, patch: Partial<Place>) {
    const p = this.current?.places.find((x) => x.id === id)
    if (!p) return
    Object.assign(p, patch)
    this.queue('place', id, patch)
  }

  async deletePlace(id: number) {
    const d = this.current
    if (!d) return
    const place = d.places.find((p) => p.id === id)
    d.places = d.places.filter((p) => p.id !== id)
    this.focus.forget({ type: 'place', id })
    await api.deletePlace(id)
    // Legs keep their link to the hidden place, so restoring it re-links them.
    this.notify(`Removed “${place?.name ?? 'place'}”`, () => this.restoreAndReload('places', id))
  }

  private async restoreAndReload(table: string, id: number) {
    await api.restore(table, id)
    await this.reload()
  }

  /** Move a place to a new position in the list; the order is saved as sort_order. */
  movePlace(id: number, to: number) {
    const d = this.current
    if (!d) return
    const from = d.places.findIndex((p) => p.id === id)
    to = Math.max(0, Math.min(to, d.places.length - 1))
    if (from < 0 || from === to) return
    const [p] = d.places.splice(from, 1)
    d.places.splice(to, 0, p)
    d.places.forEach((pl, i) => {
      if (pl.sort_order !== i + 1) this.patchPlace(pl.id, { sort_order: i + 1 })
    })
  }

  /** Shift a stay by whole days, keeping its length. */
  shiftStay(id: number, days: number) {
    const p = this.current?.places.find((x) => x.id === id)
    if (!p || !days) return
    const move = (d: string | null) => (d ? iso(addDays(parse(d), days)) : null)
    this.patchPlace(id, { arrive_date: move(p.arrive_date), depart_date: move(p.depart_date) })
  }

  async addNote() {
    const d = this.current
    if (!d) return
    d.notes.unshift(await api.createNote(d.trip.id, { title: '', body: '' }))
  }

  patchNote(id: number, patch: Partial<Note>) {
    const n = this.current?.notes.find((x) => x.id === id)
    if (!n) return
    Object.assign(n, patch)
    this.queue('note', id, patch)
  }

  async deleteNote(id: number) {
    const d = this.current
    if (!d) return
    d.notes = d.notes.filter((n) => n.id !== id)
    await api.deleteNote(id)
    this.notify('Note deleted', () => this.restoreAndReload('notes', id))
  }

  async addLeg(partial: Partial<Leg> = {}) {
    const d = this.current
    if (!d) return
    const last = d.legs.at(-1)
    const leg = await api.createLeg(d.trip.id, {
      mode: 'flight',
      from_name: last?.to_name ?? '',
      from_place_id: last?.to_place_id ?? null,
      from_lat: last?.to_lat ?? null,
      from_lng: last?.to_lng ?? null,
      depart_date: last?.arrive_date ?? d.trip.start_date,
      ...partial,
    })
    d.legs.push(leg)
    this.focus.startEdit({ type: 'leg', id: leg.id })
  }

  patchLeg(id: number, patch: Partial<Leg>) {
    const l = this.current?.legs.find((x) => x.id === id)
    if (!l) return
    Object.assign(l, patch)
    this.queue('leg', id, patch)
  }

  async deleteLeg(id: number) {
    const d = this.current
    if (!d) return
    d.legs = d.legs.filter((l) => l.id !== id)
    this.focus.forget({ type: 'leg', id })
    await api.deleteLeg(id)
    this.notify('Travel leg removed', () => this.restoreAndReload('legs', id))
  }

  async addItem(placeId: number | null, text: string) {
    const d = this.current
    if (!d || !text.trim()) return
    const mine = d.items.filter((i) => i.place_id === placeId)
    d.items.push(
      await api.createItem(d.trip.id, {
        place_id: placeId,
        text: text.trim(),
        sort_order: mine.reduce((m, i) => Math.max(m, i.sort_order), 0) + 1,
      }),
    )
  }

  patchItem(id: number, patch: Partial<ChecklistItem>) {
    const i = this.current?.items.find((x) => x.id === id)
    if (!i) return
    Object.assign(i, patch)
    this.queue('item', id, patch)
  }

  async deleteItem(id: number) {
    const d = this.current
    if (!d) return
    d.items = d.items.filter((i) => i.id !== id)
    await api.deleteItem(id)
    this.notify('Checklist item removed', () => this.restoreAndReload('items', id))
  }

  async uploadFiles(files: File[], target: { placeId?: number; legId?: number }) {
    const d = this.current
    if (!d) return
    for (const file of files) {
      try {
        const a: Attachment = await api.upload(d.trip.id, await shrinkImage(file), target)
        d.attachments.push(a)
      } catch (e) {
        this.notify(`${file.name}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  async deleteAttachment(id: number) {
    const d = this.current
    if (!d) return
    const a = d.attachments.find((x) => x.id === id)
    d.attachments = d.attachments.filter((x) => x.id !== id)
    await api.deleteAttachment(id)
    this.notify(`Removed ${a?.name ?? 'file'}`, () => this.restoreAndReload('attachments', id))
  }

  /** Debounced, merged saves per entity, so typing doesn't write on every keystroke. */
  private queue(kind: SaveKind, id: number, patch: object) {
    const key = `${kind}:${id}`
    this.pending.set(key, { ...this.pending.get(key), ...patch })
    clearTimeout(this.timers.get(key))
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key)
        void this.persist([key])
      }, 400),
    )
  }

  /**
   * Write the waiting edits for these entities. An edit that fails to save stays queued (so the next save, switching
   * trips, or the app being hidden tries again) and you are told, instead of it quietly disappearing.
   */
  private async persist(keys: string[]) {
    const jobs = keys.flatMap((key) => {
      const patch = this.pending.get(key)
      if (!patch) return []
      this.pending.delete(key)
      return [{ key, patch }]
    })
    const results = await Promise.allSettled(
      jobs.map(({ key, patch }) => {
        const [kind, id] = key.split(':')
        return SAVE[kind as SaveKind](Number(id), patch as never)
      }),
    )
    let failed = false
    results.forEach((r, i) => {
      if (r.status !== 'rejected') return
      failed = true
      const { key, patch } = jobs[i]
      this.pending.set(key, { ...patch, ...this.pending.get(key) }) // anything typed since wins over the failed attempt
    })
    if (failed) this.notify('Couldn’t save your last change. It will try again. Is your device out of storage?')
  }

  /** Save everything waiting right now (when switching trips, exporting, or the app is hidden). */
  async flush() {
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
    await this.persist([...this.pending.keys()])
  }
}

export const store = new Store()
