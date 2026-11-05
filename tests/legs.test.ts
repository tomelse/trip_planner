import { describe, expect, it } from 'vitest'
import { endpoint, legBends, legDuration, legTzNote } from '../src/lib/legs'
import { JFK, LHR, leg, place } from './helpers'

describe('legBends', () => {
  const out = leg(1, { ...LHR, ...JFK, depart_date: '2026-04-01' })
  const back = leg(2, { from_lat: 40.64, from_lng: -73.78, to_lat: 51.47, to_lng: -0.45, depart_date: '2026-04-10' })
  const again = leg(3, { ...LHR, ...JFK, depart_date: '2026-04-20' })

  it('gives each direction its own arc, and fans out repeats of the same route in departure order', () => {
    const b = legBends([again, back, out], [])
    expect(b.get(1)).toBe(0.18)
    expect(b.get(2)).toBe(0.18) // the return is a different directed route, so it bows the other way on its own
    expect(b.get(3)).toBeCloseTo(0.3) // the second LHR to JFK leg is pushed further out
  })

  it('does not depend on which legs are being shown', () => {
    expect(legBends([out, back, again], []).get(3)).toBeCloseTo(0.3)
  })
})

describe('endpoints', () => {
  it('uses a located point, or a linked place, or nothing', () => {
    const hotel = place(5, { lat: 10, lng: 20 })
    expect(endpoint(leg(1, { ...LHR }), 'from', [])).toEqual([51.47, -0.45])
    expect(endpoint(leg(1, { to_place_id: 5 }), 'to', [hotel])).toEqual([10, 20])
    expect(endpoint(leg(1), 'from', [hotel])).toBeNull()
    expect(endpoint(leg(1, { to_place_id: 99 }), 'to', [hotel])).toBeNull() // a deleted place
  })
})

describe('leg times', () => {
  const l = leg(1, { ...LHR, ...JFK, depart_date: '2026-04-01', depart_time: '09:30', arrive_date: '2026-04-01', arrive_time: '12:45' })
  it('shows the zone, flagged when detected, and the duration', () => {
    expect(legTzNote(l, 'from', [])).toBe('Europe/London · UTC+1 (detected)')
    expect(legTzNote({ ...l, from_tz: 'Asia/Tokyo' }, 'from', [])).toBe('Asia/Tokyo · UTC+9')
    expect(legTzNote(leg(2), 'from', [])).toMatch(/Unknown/)
    expect(legDuration(l, [])).toBe('8h 15m')
    expect(legDuration(leg(3), [])).toBe('')
  })
})
