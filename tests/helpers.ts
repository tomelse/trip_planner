import { IDBFactory } from 'fake-indexeddb'
import { vi } from 'vitest'
import type { Leg, Place, TripDetail } from '../src/lib/types'

/** A brand-new, empty on-device database, with fresh copies of the modules that hold a connection to it. */
export async function freshDb() {
  globalThis.indexedDB = new IDBFactory()
  vi.resetModules()
  const db = await import('../src/lib/db')
  const backup = await import('../src/lib/backup')
  return { db, backup }
}

export const leg = (id: number, o: Partial<Leg> = {}): Leg => ({
  id, trip_id: 1, mode: 'flight', from_name: 'A', from_place_id: null, from_lat: null, from_lng: null,
  to_name: 'B', to_place_id: null, to_lat: null, to_lng: null, from_tz: null, to_tz: null,
  depart_date: null, depart_time: null, arrive_date: null, arrive_time: null,
  carrier: '', number: '', confirmation: '', notes: '', ...o,
})

export const place = (id: number, o: Partial<Place> = {}): Place => ({
  id, trip_id: 1, name: `P${id}`, address: '', category: '', lat: 40.7, lng: -74, notes: '', color: '#e03131',
  sort_order: id, arrive_date: null, arrive_time: null, depart_date: null, depart_time: null, ...o,
})

export const detail = (legs: Leg[] = [], places: Place[] = [], trip: Partial<TripDetail['trip']> = {}): TripDetail => ({
  trip: { id: 1, name: 'T', start_date: null, end_date: null, created_at: '2026-01-01 00:00:00', ...trip },
  legs, places, notes: [], items: [], attachments: [],
})

/** Real shapes: Heathrow and JFK, so time zones resolve to Europe/London and America/New_York. */
export const LHR = { from_lat: 51.47, from_lng: -0.45 }
export const JFK = { to_lat: 40.64, to_lng: -73.78 }
