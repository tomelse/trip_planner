export interface Trip {
  id: number
  name: string
  start_date: string | null
  end_date: string | null
  created_at: string
}

export interface Place {
  id: number
  trip_id: number
  name: string
  address: string
  category: string
  lat: number
  lng: number
  notes: string
  arrive_date: string | null
  arrive_time: string | null
  depart_date: string | null
  depart_time: string | null
  sort_order: number
  color: string
}

export interface Note {
  id: number
  trip_id: number
  title: string
  body: string
  updated_at: string
}

export interface ChecklistItem {
  id: number
  trip_id: number
  /** null for the trip-level checklist */
  place_id: number | null
  text: string
  done: 0 | 1
  sort_order: number
}

export interface Attachment {
  id: number
  trip_id: number
  place_id: number | null
  leg_id: number | null
  name: string
  mime: string
  size: number
  created_at: string
}

export type LegMode = 'flight' | 'train' | 'bus' | 'ferry' | 'car' | 'other'

/** Dates are YYYY-MM-DD and times HH:mm, both local to the place they refer to. */
export interface Leg {
  id: number
  trip_id: number
  mode: LegMode
  from_name: string
  from_place_id: number | null
  from_lat: number | null
  from_lng: number | null
  to_name: string
  to_place_id: number | null
  to_lat: number | null
  to_lng: number | null
  /** IANA zone overrides; when null the zone is looked up from the end's coordinates. */
  from_tz: string | null
  to_tz: string | null
  depart_date: string | null
  depart_time: string | null
  arrive_date: string | null
  arrive_time: string | null
  carrier: string
  number: string
  confirmation: string
  notes: string
}

export interface TripDetail {
  trip: Trip
  places: Place[]
  notes: Note[]
  legs: Leg[]
  items: ChecklistItem[]
  attachments: Attachment[]
}
