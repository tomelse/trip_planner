import { describe, expect, it } from 'vitest'
import { clean, cleanMime, cleanStamp, isColor, MAX_TEXT } from '../src/lib/clean'

describe('clean', () => {
  it('accepts plain hex colours only', () => {
    for (const ok of ['#e03131', '#fff', '#FFFFFF80', '']) expect(clean('color', ok)).toBe(ok)
    for (const bad of ['red', 'url(https://x/y)', '#12', '#e03131;"><img src=x onerror=alert(1)>', 5, null]) {
      expect(clean('color', bad)).toBeUndefined()
    }
    expect(isColor('#e03131') && !isColor('red')).toBe(true)
  })

  it('keeps coordinates on the globe, and null where a leg end is unplaced', () => {
    expect(clean('lat', 40.7)).toBe(40.7)
    expect([clean('lat', 91), clean('lng', -181), clean('lat', '40'), clean('lat', null), clean('lat', NaN)]).toEqual([undefined, undefined, undefined, undefined, undefined])
    expect([clean('from_lat', null), clean('to_lng', 12), clean('from_lat', 200)]).toEqual([null, 12, undefined])
  })

  it('accepts real dates and times only', () => {
    expect(clean('arrive_date', '2026-04-01')).toBe('2026-04-01')
    expect(clean('arrive_date', null)).toBeNull()
    for (const bad of ['2026-02-31', '2026-13-01', '1 April', '2026-4-1', 20260401]) expect(clean('depart_date', bad)).toBeUndefined()
    expect(clean('arrive_time', '09:30')).toBe('09:30')
    for (const bad of ['24:00', '9:30', '09:60', 'noon']) expect(clean('depart_time', bad)).toBeUndefined()
  })

  it('accepts known modes, categories and time zones only', () => {
    expect(clean('mode', 'train')).toBe('train')
    expect(clean('mode', 'rocket')).toBeUndefined()
    expect([clean('category', 'food'), clean('category', ''), clean('category', 'x')]).toEqual(['food', '', undefined])
    expect(clean('from_tz', 'Europe/London')).toBe('Europe/London')
    expect(clean('from_tz', 'Not/AZone')).toBeUndefined() // an unknown zone would throw wherever times are shown
    expect(clean('to_tz', null)).toBeNull()
  })

  it('accepts only positive whole numbers as links, and 0 or 1 for done', () => {
    expect([clean('place_id', 5), clean('place_id', null), clean('place_id', 0), clean('place_id', 1.5), clean('from_place_id', '5')]).toEqual([5, null, undefined, undefined, undefined])
    expect([clean('done', true), clean('done', 0), clean('done', 'yes'), clean('done', 2)]).toEqual([1, 0, undefined, undefined])
  })

  it('caps text and rejects non-text, but leaves unknown columns alone', () => {
    expect((clean('notes', 'x'.repeat(MAX_TEXT + 500)) as string).length).toBe(MAX_TEXT)
    expect(clean('name', { evil: true })).toBeUndefined()
    expect(clean('whatever', 'as is')).toBe('as is')
  })

  it('cleans mime types and timestamps', () => {
    expect([cleanMime('IMAGE/PNG'), cleanMime('text/html;<script>'), cleanMime(7), cleanMime('image/svg+xml')]).toEqual(['image/png', 'application/octet-stream', 'application/octet-stream', 'image/svg+xml'])
    expect([cleanStamp('2026-04-01 09:30:00'), cleanStamp('2026-04-01T09:30:00Z'), cleanStamp(null)]).toEqual(['2026-04-01 09:30:00', null, null])
  })
})
