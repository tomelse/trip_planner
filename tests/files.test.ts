import { afterEach, describe, expect, it, vi } from 'vitest'
import { fitWithin, shrinkImage } from '../src/lib/files'

afterEach(() => vi.unstubAllGlobals())

describe('fitWithin', () => {
  it('scales the longest side down to the limit, keeping the proportions', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2048, height: 1536, scaled: true })
    expect(fitWithin(3000, 4000)).toEqual({ width: 1536, height: 2048, scaled: true })
  })
  it('never makes a picture bigger', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600, scaled: false })
    expect(fitWithin(2048, 2048).scaled).toBe(false)
  })
})

describe('shrinkImage', () => {
  const photo = (bytes = 5_000_000) => new File([new Uint8Array(bytes)], 'IMG_1.jpg', { type: 'image/jpeg', lastModified: 123 })

  /** Stand-ins for the browser's image decoding and canvas. */
  function browser(opts: { width: number; height: number; encoded?: number; decodeFails?: boolean }) {
    const drawn: number[] = []
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({ drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) => drawn.push(w, h) }),
      toBlob: (cb: (b: Blob | null) => void, type: string) => cb(new Blob([new Uint8Array(opts.encoded ?? 400_000)], { type })),
    }
    vi.stubGlobal('document', { createElement: () => canvas })
    vi.stubGlobal('createImageBitmap', async () => {
      if (opts.decodeFails) throw new Error('cannot decode')
      return { width: opts.width, height: opts.height, close() {} }
    })
    return { canvas, drawn }
  }

  it('re-saves a big photo smaller, with the same name and type', async () => {
    const { canvas } = browser({ width: 4000, height: 3000 })
    const original = photo()
    const out = await shrinkImage(original)
    expect([canvas.width, canvas.height]).toEqual([2048, 1536])
    expect(out).not.toBe(original)
    expect(out.size).toBeLessThan(original.size)
    expect(out).toMatchObject({ name: 'IMG_1.jpg', type: 'image/jpeg', lastModified: 123 })
  })

  it('leaves a photo that is already small alone', async () => {
    browser({ width: 1200, height: 800 })
    const original = photo(300_000)
    expect(await shrinkImage(original)).toBe(original)
  })

  it('keeps the original when re-saving would not make it smaller', async () => {
    browser({ width: 4000, height: 3000, encoded: 9_000_000 })
    const original = photo()
    expect(await shrinkImage(original)).toBe(original)
  })

  it('keeps the original when the picture cannot be decoded, and leaves other files alone', async () => {
    browser({ width: 4000, height: 3000, decodeFails: true })
    const original = photo()
    expect(await shrinkImage(original)).toBe(original)
    const pdf = new File(['%PDF'], 'ticket.pdf', { type: 'application/pdf' })
    expect(await shrinkImage(pdf)).toBe(pdf)
    const gif = new File(['GIF89a'], 'a.gif', { type: 'image/gif' })
    expect(await shrinkImage(gif)).toBe(gif) // may be animated; stored as is
  })

  it('does nothing where the browser cannot do it', async () => {
    const original = photo()
    expect(await shrinkImage(original)).toBe(original)
  })
})
