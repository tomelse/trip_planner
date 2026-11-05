import { describe, expect, it } from 'vitest'
import { ago, backupStatus, markBackedUp, noteFirstUse } from '../src/lib/backupStatus'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 5, 1)
const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('backup status', () => {
  it('is not due when there is nothing to lose', () => {
    expect(backupStatus(false, NOW, memory()).due).toBe(false)
  })

  it('gives a new user a week before asking, then asks', () => {
    const s = memory()
    noteFirstUse(NOW - 3 * DAY, s)
    expect(backupStatus(true, NOW, s)).toEqual({ due: false, label: 'Never backed up' })
    noteFirstUse(NOW - 30 * DAY, s) // already recorded, so a later call changes nothing
    expect(backupStatus(true, NOW, s).due).toBe(false)
    expect(backupStatus(true, NOW + 5 * DAY, s).due).toBe(true)
  })

  it('is due two weeks after the last backup, and resets when you back up', () => {
    const s = memory()
    noteFirstUse(NOW - 90 * DAY, s)
    markBackedUp(NOW - 10 * DAY, s)
    expect(backupStatus(true, NOW, s)).toEqual({ due: false, label: 'Last backup 10 days ago' })
    expect(backupStatus(true, NOW + 5 * DAY, s).due).toBe(true)
    markBackedUp(NOW + 5 * DAY, s)
    expect(backupStatus(true, NOW + 5 * DAY, s)).toEqual({ due: false, label: 'Last backup today' })
  })

  it('copes with storage that is unavailable or throws', () => {
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(() => (noteFirstUse(NOW, broken), markBackedUp(NOW, broken))).not.toThrow()
    expect(backupStatus(true, NOW, broken)).toEqual({ due: false, label: 'Never backed up' })
    expect(backupStatus(true, NOW, null).due).toBe(false)
  })

  it('says how long ago in plain words', () => {
    expect([0.5, 1, 5, 14, 30, 90].map((d) => ago(d * DAY))).toEqual(['today', 'yesterday', '5 days ago', '2 weeks ago', '4 weeks ago', '3 months ago'])
  })
})
