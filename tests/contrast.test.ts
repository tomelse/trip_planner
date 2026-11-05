import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** Reads the colour tokens out of app.css so a future tweak can't quietly make text hard to read again. */
const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8')
const vars = (block: string) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
const light = vars(css.match(/:root\s*\{([^}]*)\}/)![1])
const dark = { ...light, ...vars(css.match(/prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/)![1]) }

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe.each([['light', light], ['dark', dark]])('%s theme text contrast', (_name, t) => {
  const text = ['ink', 'ink-2', 'ink-3', 'accent', 'warn', 'danger']
  const surfaces = ['bg', 'panel', 'hover']
  it.each(text)('%s is readable (4.5:1) on every surface', (token) => {
    for (const s of surfaces) expect(ratio(t[token], t[s]), `${token} on ${s}`).toBeGreaterThanOrEqual(4.5)
  })
})
