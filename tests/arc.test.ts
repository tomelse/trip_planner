import { beforeAll, describe, expect, it, vi } from 'vitest'

// Leaflet touches window/document when it loads; give it just enough to do that.
let arcPoints: typeof import('../src/lib/arc').arcPoints
let arcArrow: typeof import('../src/lib/arc').arcArrow
beforeAll(async () => {
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('devicePixelRatio', 1)
  vi.stubGlobal('screen', {})
  vi.stubGlobal('document', { documentElement: { style: {} }, createElement: () => ({ style: {}, getContext: () => null }) })
  ;({ arcPoints, arcArrow } = await import('../src/lib/arc'))
})

describe('leg arcs', () => {
  it('an outbound leg and its return bow to opposite sides, so they never overlap', () => {
    const out = arcPoints([0, 0], [0, 20], 0.18)
    const back = arcPoints([0, 20], [0, 0], 0.18)
    expect(out[16][0]).toBeGreaterThan(0) // east-bound bows north
    expect(back[16][0]).toBeLessThan(0) // the return bows south
    expect(out[0]).toEqual([0, 0])
    expect(out.at(-1)).toEqual([0, 20])
  })

  it('points the arrowhead along the direction of travel', () => {
    expect(arcArrow([0, 0], [0, 20], 0).angle).toBeCloseTo(0)
    expect(arcArrow([0, 0], [20, 0], 0).angle).toBe(-90) // north is up on screen
    expect(Math.abs(arcArrow([0, 20], [0, 0], 0).angle)).toBe(180)
    expect(arcArrow([20, 0], [0, 0], 0).angle).toBe(90)
  })

  it('copes with two identical points', () => {
    expect(arcPoints([1, 1], [1, 1], 0.18)).toHaveLength(2)
  })
})
