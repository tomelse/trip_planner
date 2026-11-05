type Hist = Pick<History, 'pushState' | 'replaceState' | 'go'>

/**
 * Keeps the browser history exactly as tall as the number of open layers, so Back closes the topmost layer.
 * Pure of any UI framework: it is told the layers, and told when a pop happened.
 */
export class BackStack {
  /** History entries pushed on top of the starting one. Equals the layer count when settled. */
  private pushed = 0
  /** Pops we caused ourselves (dropping entries after a layer was closed by tapping) and must not act on. */
  private ignore = 0

  constructor(
    /** The open layers, topmost first, each with the thing that closes it. */
    private layers: () => (() => void)[],
    private history: Hist,
  ) {
    history.replaceState({ depth: 0 }, '')
  }

  /** The app opened or closed layers: make the history the same height. */
  sync() {
    const depth = this.layers().length
    while (this.pushed < depth) this.history.pushState({ depth: ++this.pushed }, '')
    if (this.pushed > depth) {
      const extra = this.pushed - depth
      this.pushed = depth
      this.ignore++
      this.history.go(-extra)
    }
  }

  /** The user pressed Back (or Forward) and landed on an entry with this saved state. */
  onPop(state: unknown) {
    if (this.ignore > 0) {
      this.ignore--
      return
    }
    const target = typeof (state as { depth?: unknown } | null)?.depth === 'number' ? (state as { depth: number }).depth : 0
    if (target > this.pushed) {
      // Forward, or an entry left over from before a reload: nothing to reopen, so step back out of it.
      this.ignore++
      this.history.go(this.pushed - target)
      return
    }
    // Close layers until the stack is as high as the entry we landed on (bounded, in case a closer does nothing).
    for (let guard = 0, open = this.layers(); open.length > target && guard < 20; guard++, open = this.layers()) open[0]()
    // Closing one layer can close others with it; the next sync() trims any entries left over.
    this.pushed = target
    this.sync()
  }
}
