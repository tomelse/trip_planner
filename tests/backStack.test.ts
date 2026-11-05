import { describe, expect, it } from 'vitest'
import { BackStack } from '../src/lib/backStack'

/** A tiny browser history: pushState drops forward entries, go() fires popstate asynchronously. */
class FakeHistory {
  entries: unknown[] = [null]
  idx = 0
  exited = false
  stack!: BackStack
  pushState(s: unknown) {
    this.entries.splice(this.idx + 1)
    this.entries.push(s)
    this.idx++
  }
  replaceState(s: unknown) {
    this.entries[this.idx] = s
  }
  go(n: number) {
    setTimeout(() => {
      const to = this.idx + n
      if (to < 0) return void (this.exited = true)
      this.idx = to
      this.stack.onPop(this.entries[this.idx])
    }, 0)
  }
  async back() {
    this.go(-1)
    await flush()
  }
  async forward() {
    this.go(1)
    await flush()
  }
}
const flush = () => new Promise((r) => setTimeout(r, 5))

function setup(entries?: unknown[], idx = 0) {
  const ui = { dialog: false, menu: false, editing: false, selected: false }
  const h = new FakeHistory()
  if (entries) {
    h.entries = entries
    h.idx = idx
  }
  const when = (open: boolean, close: () => void) => (open ? close : null)
  const layers = () =>
    [
      when(ui.dialog, () => { ui.dialog = false }),
      when(ui.menu, () => { ui.menu = false }),
      when(ui.editing, () => { ui.editing = false }),
      // closing an open item ends editing too
      when(ui.selected, () => { ui.selected = false; ui.editing = false }),
    ].filter((c): c is () => void => c !== null)
  h.stack = new BackStack(layers, h as unknown as History)
  return { ui, h, sync: async () => (h.stack.sync(), await flush()) }
}

describe('BackStack', () => {
  it('opening a layer adds an entry; Back closes it, then leaves the app', async () => {
    const { ui, h, sync } = setup()
    ui.dialog = true
    await sync()
    expect(h.idx).toBe(1)
    await h.back()
    expect(!ui.dialog && h.idx === 0 && !h.exited).toBe(true)
    await h.back()
    expect(h.exited).toBe(true)
  })

  it('closes layers one at a time, topmost first', async () => {
    const { ui, h, sync } = setup()
    ui.selected = true
    await sync()
    ui.editing = true
    await sync()
    expect(h.idx).toBe(2)
    await h.back()
    expect(ui.selected && !ui.editing && h.idx === 1).toBe(true)
    await h.back()
    expect(!ui.selected && h.idx === 0 && !h.exited).toBe(true)
  })

  it('closing a layer by tapping drops its history entry without acting on the pop', async () => {
    const { ui, h, sync } = setup()
    ui.menu = true
    await sync()
    ui.menu = false
    await sync()
    expect(h.idx).toBe(0)
    expect(h.exited).toBe(false)
  })

  it('closing several layers at once (Esc) lands back on the base entry', async () => {
    const { ui, h, sync } = setup()
    ui.selected = true
    await sync()
    ui.editing = true
    await sync()
    ui.selected = ui.editing = false
    await sync()
    expect(h.idx === 0 && !h.exited).toBe(true)
  })

  it('Forward does not reopen anything', async () => {
    const { ui, h, sync } = setup()
    ui.dialog = true
    await sync()
    await h.back()
    await h.forward()
    expect(!ui.dialog && h.idx === 0 && !h.exited).toBe(true)
  })

  it('skips entries left over from before a reload', async () => {
    const { h } = setup([{ depth: 0 }, { depth: 1 }, { depth: 2 }], 2)
    await h.back()
    expect(h.idx === 0 && !h.exited).toBe(true)
    await h.back()
    expect(h.exited).toBe(true)
  })

  it('the dialog closes before the item behind it', async () => {
    const { ui, h, sync } = setup()
    ui.selected = true
    await sync()
    ui.dialog = true
    await sync()
    await h.back()
    expect(!ui.dialog && ui.selected).toBe(true)
    await h.back()
    expect(!ui.selected && h.idx === 0).toBe(true)
  })
})
