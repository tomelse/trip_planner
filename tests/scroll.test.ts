import { beforeAll, describe, expect, it, vi } from 'vitest'

// Minimal stand-ins for the bits of the DOM the scroll helpers read.
type Fake = { parentElement: Fake | null; style: Record<string, string>; rect: { top: number; bottom: number }; scrollTop: number; scrollHeight: number; clientHeight: number; getBoundingClientRect(): { top: number; bottom: number } }
const body = {}
const mk = (parent: Fake | null, rect: { top: number; bottom: number }, style: Record<string, string> = {}): Fake => ({
  parentElement: parent, style, rect, scrollTop: 0, scrollHeight: 2000, clientHeight: 400, getBoundingClientRect() { return this.rect },
})

let scrollWithin: typeof import('../src/lib/scroll').scrollWithin
let revealRow: typeof import('../src/lib/scroll').revealRow
beforeAll(async () => {
  vi.stubGlobal('document', { body })
  vi.stubGlobal('getComputedStyle', (el: Fake) => ({ overflowY: 'visible', scrollMarginTop: '0px', ...el.style }))
  ;({ scrollWithin, revealRow } = await import('../src/lib/scroll'))
})

describe('scrolling inside a panel, never the page', () => {
  const page = mk(null, { top: 0, bottom: 800 }, { overflowY: 'hidden' })
  const panel = mk(page, { top: 100, bottom: 500 }, { overflowY: 'auto' })
  const wrap = mk(panel, { top: 0, bottom: 0 })
  const el = (top: number, bottom: number, margin = '0px') => mk(wrap, { top, bottom }, { scrollMarginTop: margin })
  const reset = () => ((panel.scrollTop = 0), (page.scrollTop = 0))

  it("'start' puts the row at the top of the panel", () => {
    reset()
    scrollWithin(el(700, 740) as unknown as HTMLElement, 'start')
    expect(panel.scrollTop).toBe(600)
    expect(page.scrollTop).toBe(0)
  })

  it('keeps room for sticky bars via scroll-margin-top', () => {
    reset()
    scrollWithin(el(700, 740, '90px') as unknown as HTMLElement, 'start')
    expect(panel.scrollTop).toBe(510)
  })

  it("'nearest' only moves when the row is out of view", () => {
    reset()
    scrollWithin(el(450, 480) as unknown as HTMLElement)
    expect(panel.scrollTop).toBe(0)
    scrollWithin(el(520, 560) as unknown as HTMLElement)
    expect(panel.scrollTop).toBe(60)
    panel.scrollTop = 300
    scrollWithin(el(40, 80) as unknown as HTMLElement)
    expect(panel.scrollTop).toBe(240)
  })

  it('does nothing, and never scrolls the page, when no panel scrolls', () => {
    reset()
    const lonely = mk(page, { top: 0, bottom: 0 })
    scrollWithin(mk(lonely, { top: 900, bottom: 940 }) as unknown as HTMLElement, 'start')
    expect(page.scrollTop).toBe(0)
  })

  it('revealRow finds a row by id and ignores null, a missing list and an unknown id', () => {
    reset()
    const list = { querySelector: (q: string) => (q === '[data-id="7"]' ? el(700, 740) : null) } as unknown as HTMLElement
    revealRow(list, 7)
    expect(panel.scrollTop).toBeGreaterThan(0)
    expect(() => (revealRow(list, null), revealRow(undefined, 3), revealRow(list, 99))).not.toThrow()
  })
})
