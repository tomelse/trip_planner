import { describe, expect, it } from 'vitest'
import { findIssues } from '../src/lib/issues'
import { JFK, LHR, detail, leg, place } from './helpers'

const messages = (d: ReturnType<typeof detail>) => findIssues(d).map((i) => i.message)

describe('findIssues', () => {
  it('is quiet about a sensible trip', () => {
    const flight = leg(1, { ...LHR, ...JFK, depart_date: '2026-04-01', depart_time: '09:30', arrive_date: '2026-04-01', arrive_time: '12:45' })
    expect(findIssues(detail([flight]))).toEqual([])
  })

  it('catches a leg that arrives before it departs, reading each end in its own time zone', () => {
    // 13:10 in New York is 17:10Z; arriving "10:00" in Los Angeles is 17:00Z, ten minutes earlier.
    const l = leg(2, { from_lat: 40.64, from_lng: -73.78, to_lat: 34.05, to_lng: -118.2, depart_date: '2026-04-01', depart_time: '13:10', arrive_date: '2026-04-01', arrive_time: '10:00' })
    const out = findIssues(detail([l]))
    expect(out.some((i) => i.level === 'error' && /arrives before it departs/.test(i.message))).toBe(true)
  })

  it('flags tight and impossible connections', () => {
    const a = leg(1, { ...LHR, ...JFK, depart_date: '2026-04-01', depart_time: '09:30', arrive_date: '2026-04-01', arrive_time: '12:45' })
    const tight = leg(2, { from_lat: 40.64, from_lng: -73.78, to_lat: 34.05, to_lng: -118.2, depart_date: '2026-04-01', depart_time: '13:10', arrive_date: '2026-04-01', arrive_time: '16:00' })
    expect(messages(detail([a, tight])).some((m) => /Only .* between/.test(m))).toBe(true)
    const impossible = leg(3, { from_lat: 40.64, from_lng: -73.78, to_lat: 34.05, to_lng: -118.2, depart_date: '2026-04-01', depart_time: '11:00', arrive_date: '2026-04-01', arrive_time: '14:00' })
    expect(messages(detail([a, impossible])).some((m) => /before .* arrives/.test(m))).toBe(true)
  })

  it('warns when the next leg starts far from where the last one ended', () => {
    const a = leg(1, { ...LHR, ...JFK, depart_date: '2026-04-01', depart_time: '09:30', arrive_date: '2026-04-01', arrive_time: '12:45' })
    const b = leg(2, { from_lat: 48.8, from_lng: 2.3, to_lat: 41.9, to_lng: 12.5, depart_date: '2026-04-05', depart_time: '08:00' })
    expect(messages(detail([a, b])).some((m) => /km from where/.test(m))).toBe(true)
  })

  it('flags overlapping stays (Stay category only) and stays that end before they start', () => {
    const hotels = [
      place(1, { category: 'stay', arrive_date: '2026-04-02', depart_date: '2026-04-06' }),
      place(2, { category: 'stay', arrive_date: '2026-04-05', depart_date: '2026-04-08' }),
    ]
    expect(messages(detail([], hotels)).some((m) => /overlap/.test(m))).toBe(true)
    const sight = [place(1, { category: 'stay', arrive_date: '2026-04-02', depart_date: '2026-04-06' }), place(2, { category: 'sight', arrive_date: '2026-04-03', depart_date: '2026-04-03' })]
    expect(messages(detail([], sight)).some((m) => /overlap/.test(m))).toBe(false)
    expect(messages(detail([], [place(3, { arrive_date: '2026-04-06', depart_date: '2026-04-02' })])).some((m) => /before arrival/.test(m))).toBe(true)
  })

  it('compares a leg with the places it links to', () => {
    const hotel = place(5, { arrive_date: '2026-04-02' })
    const late = leg(1, { to_place_id: 5, depart_date: '2026-04-01', arrive_date: '2026-04-03' })
    expect(messages(detail([late], [hotel])).some((m) => /after you're due/.test(m))).toBe(true)
    const early = leg(2, { from_place_id: 5, depart_date: '2026-04-01' })
    expect(messages(detail([early], [hotel])).some((m) => /before you get there/.test(m))).toBe(true)
  })

  it('warns about anything outside the trip dates', () => {
    const l = leg(1, { depart_date: '2026-04-12' })
    const d = detail([l], [], { start_date: '2026-04-01', end_date: '2026-04-10' })
    expect(messages(d).some((m) => /outside the trip dates/.test(m))).toBe(true)
  })
})
