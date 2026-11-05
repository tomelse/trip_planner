import { afterEach, describe, expect, it, vi } from 'vitest'
import { clock, refreshClock } from '../src/lib/clock.svelte'

afterEach(() => vi.useRealTimers())

describe('clock', () => {
  it('moves to the next day after midnight, so a long-open app stops highlighting yesterday', () => {
    refreshClock(new Date(2026, 3, 1, 23, 59)) // 1 April, local time
    expect(clock.today).toBe('2026-04-01')
    refreshClock(new Date(2026, 3, 2, 0, 1))
    expect(clock.today).toBe('2026-04-02')
  })

  it('stays put within the same day', () => {
    refreshClock(new Date(2026, 3, 2, 9, 0))
    refreshClock(new Date(2026, 3, 2, 21, 0))
    expect(clock.today).toBe('2026-04-02')
  })
})
