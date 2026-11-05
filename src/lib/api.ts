import type { Attachment, ChecklistItem, Leg, Note, Place, Trip, TripDetail } from './types'

async function req<T>(method: string, path: string, data?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: data ? { 'content-type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`)
  return res.status === 204 ? (undefined as T) : res.json()
}

export const api = {
  trips: () => req<Trip[]>('GET', '/trips'),
  trip: (id: number) => req<TripDetail>('GET', `/trips/${id}`),
  createTrip: (data: Partial<Trip>) => req<Trip>('POST', '/trips', data),
  patchTrip: (id: number, data: Partial<Trip>) => req<Trip>('PATCH', `/trips/${id}`, data),
  deleteTrip: (id: number) => req<void>('DELETE', `/trips/${id}`),
  createPlace: (tripId: number, data: Partial<Place>) => req<Place>('POST', `/trips/${tripId}/places`, data),
  patchPlace: (id: number, data: Partial<Place>) => req<Place>('PATCH', `/places/${id}`, data),
  deletePlace: (id: number) => req<void>('DELETE', `/places/${id}`),
  createNote: (tripId: number, data: Partial<Note>) => req<Note>('POST', `/trips/${tripId}/notes`, data),
  patchNote: (id: number, data: Partial<Note>) => req<Note>('PATCH', `/notes/${id}`, data),
  deleteNote: (id: number) => req<void>('DELETE', `/notes/${id}`),
  createLeg: (tripId: number, data: Partial<Leg>) => req<Leg>('POST', `/trips/${tripId}/legs`, data),
  patchLeg: (id: number, data: Partial<Leg>) => req<Leg>('PATCH', `/legs/${id}`, data),
  deleteLeg: (id: number) => req<void>('DELETE', `/legs/${id}`),
  createItem: (tripId: number, data: Partial<ChecklistItem>) => req<ChecklistItem>('POST', `/trips/${tripId}/items`, data),
  patchItem: (id: number, data: Partial<ChecklistItem>) => req<ChecklistItem>('PATCH', `/items/${id}`, data),
  deleteItem: (id: number) => req<void>('DELETE', `/items/${id}`),
  deleteAttachment: (id: number) => req<void>('DELETE', `/attachments/${id}`),
  /** Undo a delete. `table` is the plural API resource name. */
  restore: (table: string, id: number) => req<unknown>('POST', `/restore/${table}/${id}`),
  async upload(tripId: number, file: File, target: { placeId?: number; legId?: number }): Promise<Attachment> {
    const q = new URLSearchParams({ name: file.name })
    if (target.placeId) q.set('place_id', String(target.placeId))
    if (target.legId) q.set('leg_id', String(target.legId))
    const res = await fetch(`/api/trips/${tripId}/attachments?${q}`, {
      method: 'POST',
      headers: { 'content-type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!res.ok) {
      const msg = (await res.json().catch(() => null))?.error
      throw new Error(msg ?? `Upload failed (${res.status})`)
    }
    return res.json()
  },
}
