import * as db from './db'
import type { Attachment, ChecklistItem, Leg, Note, Place, Trip, TripDetail } from './types'

/**
 * The data layer the store talks to. It used to call a server; now it reads and writes the on-device database
 * (`db.ts`), with the same method names, so nothing above it needed to change.
 */

const row = <T>(r: unknown) => r as T

export const api = {
  trips: async () => row<Trip[]>(await db.listTrips()),
  async trip(id: number): Promise<TripDetail> {
    const d = await db.tripDetail(id)
    if (!d) throw new Error('not found')
    return d
  },
  createTrip: async (data: Partial<Trip>) => row<Trip>(await db.insert('trips', data)),
  patchTrip: async (id: number, data: Partial<Trip>) => row<Trip>(await db.update('trips', id, data)),
  deleteTrip: async (id: number) => void (await db.remove('trips', id)),
  createPlace: async (tripId: number, data: Partial<Place>) => row<Place>(await db.insert('places', data, tripId)),
  patchPlace: async (id: number, data: Partial<Place>) => row<Place>(await db.update('places', id, data)),
  deletePlace: async (id: number) => void (await db.remove('places', id)),
  createNote: async (tripId: number, data: Partial<Note>) => row<Note>(await db.insert('notes', data, tripId)),
  patchNote: async (id: number, data: Partial<Note>) => row<Note>(await db.update('notes', id, data)),
  deleteNote: async (id: number) => void (await db.remove('notes', id)),
  createLeg: async (tripId: number, data: Partial<Leg>) => row<Leg>(await db.insert('legs', data, tripId)),
  patchLeg: async (id: number, data: Partial<Leg>) => row<Leg>(await db.update('legs', id, data)),
  deleteLeg: async (id: number) => void (await db.remove('legs', id)),
  createItem: async (tripId: number, data: Partial<ChecklistItem>) => row<ChecklistItem>(await db.insert('items', data, tripId)),
  patchItem: async (id: number, data: Partial<ChecklistItem>) => row<ChecklistItem>(await db.update('items', id, data)),
  deleteItem: async (id: number) => void (await db.remove('items', id)),
  deleteAttachment: async (id: number) => void (await db.remove('attachments', id)),
  /** Undo a delete. `table` is the plural table name. */
  restore: async (table: string, id: number) => db.restore(table as db.Table, id),
  upload: (tripId: number, file: File, target: { placeId?: number; legId?: number }): Promise<Attachment> =>
    db.addAttachment(tripId, file, target),
}
