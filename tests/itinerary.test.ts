import { describe, expect, it } from 'vitest'
import { buildItinerary, splitPast, type Day } from '../src/lib/itinerary'
import { detail, leg, place } from './helpers'

const day = (d: string): Day => ({ day: d, items: [] })

describe('splitPast', () => {
  const days = [day('2026-11-04'), day('2026-11-05'), day('2026-11-06'), day('2026-11-14')]

  it('tucks away days that are over and keeps today and everything ahead', () => {
    const s = splitPast(days, '2026-11-06')
    expect(s.past.map((d) => d.day)).toEqual(['2026-11-04', '2026-11-05'])
    expect(s.ahead.map((d) => d.day)).toEqual(['2026-11-06', '2026-11-14'])
    expect(s.collapsible).toBe(true)
  })

  it('has nothing to collapse before the trip starts', () => {
    expect(splitPast(days, '2026-10-01')).toMatchObject({ past: [], collapsible: false })
  })

  it('shows everything once the whole trip is over, since nothing is ahead', () => {
    const s = splitPast(days, '2027-01-01')
    expect(s.ahead).toEqual([])
    expect(s.collapsible).toBe(false)
  })
})

describe('buildItinerary', () => {
  it('groups legs and stays by day, in time order, and lists the undated separately', () => {
    const flight = leg(1, { depart_date: '2026-11-06', depart_time: '11:35', arrive_date: '2026-11-06', arrive_time: '14:55' })
    const home = place(1, { name: 'Home', arrive_date: '2026-11-06', arrive_time: '17:00', depart_date: '2026-11-14', depart_time: '16:55' })
    const spare = place(2, { name: 'Spare' })
    const itin = buildItinerary(detail([flight], [home, spare]))
    expect(itin.days.map((d) => d.day)).toEqual(['2026-11-06', '2026-11-14'])
    expect(itin.days[0].items.map((i) => i.label)).toEqual(['Flight', 'Arrive']) // 11:35 then 17:00
    expect(itin.days[1].items.map((i) => i.label)).toEqual(['Depart'])
    expect(itin.unscheduled.places.map((p) => p.name)).toEqual(['Spare'])
  })
})
