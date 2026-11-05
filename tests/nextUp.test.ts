import { describe, expect, it } from 'vitest'
import { fmtCountdown, fmtDayAway, nextUp } from '../src/lib/nextUp'
import { JFK, LHR, detail, leg, place } from './helpers'

const at = (iso: string) => Date.parse(iso)
// LHR 09:30 on 1 Apr 2026 is 08:30Z (BST); JFK 12:45 EDT is 16:45Z.
const flight = leg(1, { ...LHR, ...JFK, depart_date: '2026-04-01', depart_time: '09:30', arrive_date: '2026-04-01', arrive_time: '12:45' })

describe('nextUp', () => {
  it('reads the departure in the time zone of the place it leaves', () => {
    const n = nextUp(detail([flight]), at('2026-04-01T08:00:00Z'))
    expect(n).toMatchObject({ kind: 'leg', status: 'upcoming', at: at('2026-04-01T08:30:00Z'), timed: true })
  })

  it('shows a leg in progress, with its arrival instant', () => {
    expect(nextUp(detail([flight]), at('2026-04-01T12:00:00Z'))).toMatchObject({ status: 'in-transit', until: at('2026-04-01T16:45:00Z') })
  })

  it('has nothing next once everything is behind you', () => {
    expect(nextUp(detail([flight]), at('2026-04-01T17:00:00Z'))).toBeNull()
    expect(nextUp(detail([]), Date.now())).toBeNull()
    expect(nextUp(detail([], [place(9)]), Date.now())).toBeNull() // a place with no date
  })

  it('orders legs and place arrivals together', () => {
    const hotel = place(7, { arrive_date: '2026-04-01', arrive_time: '15:00' }) // New York 15:00 EDT = 19:00Z
    const later = leg(2, { depart_date: '2026-04-05', depart_time: '10:00' })
    expect(nextUp(detail([later, flight], [hotel]), at('2026-04-01T17:00:00Z'))).toMatchObject({ kind: 'place', id: 7, at: at('2026-04-01T19:00:00Z') })
  })

  it('treats a date-only item as lasting all day, and skips it the day after', () => {
    const allDay = leg(3, { depart_date: '2026-04-02' })
    expect(nextUp(detail([allDay]), at('2026-04-02T15:00:00Z'))).toMatchObject({ id: 3, timed: false })
    expect(nextUp(detail([allDay]), at('2026-04-04T00:00:00Z'))).toBeNull()
  })

  it('prefers an all-day item that has begun over a later timed one', () => {
    const allDay = leg(4, { depart_date: '2026-04-10' })
    const timed = leg(5, { depart_date: '2026-04-10', depart_time: '18:00' })
    expect(nextUp(detail([timed, allDay]), at('2026-04-10T09:00:00Z'))?.id).toBe(4)
  })
})

describe('formatting', () => {
  it.each([
    [30_000, 'less than a minute'],
    [45 * 60_000, '45 min'],
    [3 * 3600_000 + 20 * 60_000, '3 h 20 min'],
    [2 * 3600_000, '2 h'],
    [28 * 3600_000, '1 d 4 h'],
    [5 * 86400_000, '5 days'],
  ])('counts down %i ms as %s', (ms, want) => expect(fmtCountdown(ms)).toBe(want))

  it('labels days relative to today', () => {
    expect(fmtDayAway('2026-04-10', '2026-04-10')).toBe('Today')
    expect(fmtDayAway('2026-04-11', '2026-04-10')).toBe('Tomorrow')
    expect(fmtDayAway('2026-04-14', '2026-04-10')).toBe('In 4 days')
    expect(fmtDayAway('2026-04-01', '2026-04-10')).toBe('Today')
  })
})
