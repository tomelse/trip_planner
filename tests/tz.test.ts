import { describe, expect, it } from 'vitest'
import { fmtDuration, fmtOffset, offsetMinutes, toUtc, tzAt, validTz } from '../src/lib/tz'

describe('time zones', () => {
  it('finds the zone for a coordinate offline', () => {
    expect(tzAt(51.47, -0.45)).toBe('Europe/London')
    expect(tzAt(40.64, -73.78)).toBe('America/New_York')
    expect(tzAt(35.55, 139.78)).toBe('Asia/Tokyo')
  })

  it('turns local wall-clock times into instants, across a time-zone change', () => {
    const dep = toUtc('2026-04-01', '09:30', 'Europe/London') // BST
    const arr = toUtc('2026-04-01', '12:45', 'America/New_York') // EDT
    expect(fmtDuration((arr - dep) / 60000)).toBe('8h 15m')
    expect(offsetMinutes(dep, 'Europe/London')).toBe(60)
    expect(offsetMinutes(arr, 'America/New_York')).toBe(-240)
    expect(fmtOffset(dep, 'Europe/London')).toBe('UTC+1')
  })

  it('handles half-hour zones and the repeated hour when clocks go back', () => {
    expect(new Date(toUtc('2026-07-01', '00:00', 'Asia/Kolkata')).toISOString()).toBe('2026-06-30T18:30:00.000Z')
    expect(new Date(toUtc('2026-11-01', '01:30', 'America/New_York')).toISOString()).toBe('2026-11-01T05:30:00.000Z')
  })

  it('formats durations and recognises real zone names only', () => {
    expect(fmtDuration(45)).toBe('45m')
    expect(fmtDuration(120)).toBe('2h')
    expect(validTz('Europe/London')).toBe(true)
    expect(validTz('Not/AZone')).toBe(false)
  })
})
