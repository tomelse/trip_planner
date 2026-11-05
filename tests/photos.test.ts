import { afterEach, describe, expect, it, vi } from 'vitest'
import { articlePhoto, areasNear, distanceKm, fetchImage, findCover, neighbourhoodPhoto, sameThing } from '../src/lib/photos'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ---- a tiny fake of Wikipedia / Commons / Wikidata, keyed on what each request is asking for

type Json = Record<string, unknown>
interface Fake {
  search?: Record<string, Json> // Wikipedia search results, by page id
  areas?: Record<string, Json> // Wikipedia geosearch results
  titles?: Record<string, Json> // Wikipedia page by title
  commonsFiles?: Record<string, Json | null> // Commons imageinfo, by file name (null: not on Commons)
  category?: Record<string, Json>
  claims?: Json
}

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const info = (credit: { author?: string; license?: string } = {}, mime = 'image/jpeg') => ({
  descriptionurl: 'https://commons.wikimedia.org/wiki/File:x.jpg', width: 3000, height: 2000, mime,
  extmetadata: { Artist: { value: `<a href="//x">${credit.author ?? 'AskALotl'}</a> &amp; friends` }, LicenseShortName: { value: credit.license ?? 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' } },
})

function wikimedia(f: Fake) {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (input: string) => {
    calls.push(input)
    const u = new URL(input)
    const p = u.searchParams
    if (u.host === 'en.wikipedia.org') {
      if (p.get('generator') === 'search') return reply({ query: { pages: f.search ?? {} } })
      if (p.get('generator') === 'geosearch') return reply({ query: { pages: f.areas ?? {} } })
      if (p.get('titles')) return reply({ query: { pages: f.titles ?? {} } })
    }
    if (u.host === 'commons.wikimedia.org') {
      if (p.get('generator') === 'categorymembers') return reply({ query: { pages: f.category ?? {} } })
      const file = p.get('titles')?.replace(/^File:/, '')
      const entry = file ? f.commonsFiles?.[file] : undefined
      return reply({ query: { pages: { 1: entry ? { imageinfo: [entry] } : { missing: '' } } } })
    }
    if (u.host === 'www.wikidata.org') return reply(f.claims ?? {})
    return reply({}, 404)
  })
  return calls
}

const statue = { title: 'Statue of Liberty', index: 1, pageimage: 'Statue.jpg', thumbnail: { source: 'https://upload.wikimedia.org/s.jpg', width: 800, height: 1200 }, coordinates: [{ lat: 40.689, lon: -74.044 }] }

describe('articlePhoto', () => {
  it("returns the article's photo with its author and licence, tidied up", async () => {
    wikimedia({ search: { 1: statue }, commonsFiles: { 'Statue.jpg': info() } })
    const p = await articlePhoto('Statue of Liberty', 40.6892, -74.0445)
    expect(p).toMatchObject({ kind: 'article', subject: 'Statue of Liberty', imageUrl: 'https://upload.wikimedia.org/s.jpg', credit: { author: 'AskALotl & friends', license: 'CC BY-SA 4.0', from: 'Wikimedia Commons' } })
  })

  it('ignores an article with the right name in the wrong place (there is more than one Central Park)', async () => {
    wikimedia({ search: { 1: { ...statue, title: 'Central Park', coordinates: [{ lat: -33.9, lon: 151.2 }] } }, commonsFiles: { 'Statue.jpg': info() } })
    expect(await articlePhoto('Central Park', 40.78, -73.96)).toBeNull()
  })

  it("ignores a loose search hit that isn't really the place", async () => {
    wikimedia({ search: { 1: { ...statue, title: "Matt's Bar and Grill" } }, commonsFiles: { 'Statue.jpg': info() } })
    expect(await articlePhoto("Matt's House", 40.689, -74.044)).toBeNull()
  })

  it('never uses a picture that is not a free file on Commons (film posters, logos)', async () => {
    wikimedia({ search: { 1: statue }, commonsFiles: { 'Statue.jpg': null } })
    expect(await articlePhoto('Statue of Liberty', 40.689, -74.044)).toBeNull()
    wikimedia({ search: { 1: statue }, commonsFiles: { 'Statue.jpg': info({}, 'image/svg+xml') } })
    expect(await articlePhoto('Statue of Liberty', 40.689, -74.044)).toBeNull()
  })

  it('tries the next article when the first has no free photo', async () => {
    const second = { ...statue, title: 'Statue of Liberty', index: 2, pageimage: 'Other.jpg' }
    wikimedia({ search: { 1: statue, 2: second }, commonsFiles: { 'Statue.jpg': null, 'Other.jpg': info({ author: 'Second' }) } })
    expect((await articlePhoto('Statue of Liberty', 40.689, -74.044))?.credit.author).toMatch(/Second/)
  })
})

describe('sameThing', () => {
  it.each([
    ['Statue of Liberty', 'Statue of Liberty', true],
    ['central park', 'Central Park', true],
    ['National September 11 Memorial & Museum', 'National September 11 Memorial & Museum', true],
    ['Melbourne', 'Melbourne', true],
    ['The Eiffel Tower', 'Eiffel Tower', true],
    ["McSorley's Old Ale House", "McSorley's Old Ale House", true],
    ['Chelsea Market', 'Chelsea Market (New York)', true],
    ["Matt's House", "Matt's Bar and Grill", false],
    ['Dinner at Noz', 'Noz 17', false],
    ['', 'Anything', false],
  ])('%s vs %s -> %s', (a, b, want) => expect(sameThing(a, b)).toBe(want))
})

describe('neighbourhoodPhoto', () => {
  const area = (title: string, description: string, lat: number, lon: number): Json => ({ title, description, index: 1, coordinates: [{ lat, lon }] })
  const geo = {
    1: area('Greenwich Village', 'Neighborhood in New York City', 40.7336, -74.0027),
    2: area('Chelsea, Manhattan', 'Neighborhood in New York City', 40.7465, -74.0014),
    3: area('Ladies\' Mile Historic District', 'Historic district in Manhattan', 40.74, -73.99),
    4: area('Chelsea Market', 'Multi-use building in New York City', 40.742, -74.006),
  }

  it('picks the nearest neighbourhood article, skipping historic districts and buildings', async () => {
    wikimedia({ areas: geo })
    const a = await areasNear(40.7434, -74.0055)
    expect(a.map((x) => x.title)).toEqual(['Chelsea, Manhattan', 'Greenwich Village'])
    expect(a[0].km).toBeLessThan(a[1].km)
  })

  it("uses the neighbourhood article's photo when it is a free one", async () => {
    wikimedia({ areas: geo, titles: { 1: { title: 'Chelsea, Manhattan', pageimage: 'Chelsea.jpg', thumbnail: { source: 'https://upload.wikimedia.org/c.jpg', width: 800, height: 600 } } }, commonsFiles: { 'Chelsea.jpg': info({ author: 'Beyond My Ken' }) } })
    expect(await neighbourhoodPhoto(40.7434, -74.0055)).toMatchObject({ kind: 'neighbourhood', subject: 'Chelsea, Manhattan', credit: { author: expect.stringMatching(/Beyond My Ken/) } })
  })

  it('falls back to a landscape photo from its Commons category when the lead photo is not free', async () => {
    wikimedia({
      areas: geo,
      titles: { 1: { title: 'Chelsea, Manhattan', pageimage: 'Poster.png', thumbnail: { source: 'https://x/p.png', width: 800, height: 600 }, pageprops: { wikibase_item: 'Q1' } } },
      commonsFiles: { 'Poster.png': null },
      claims: { claims: { P373: [{ mainsnak: { datavalue: { value: 'Chelsea, Manhattan' } } }] } },
      category: {
        1: { title: 'File:tall.jpg', imageinfo: [{ thumburl: 'https://x/tall.jpg', width: 1200, height: 2400, mime: 'image/jpeg', descriptionurl: 'https://c/tall' }] }, // wrong shape
        2: { title: 'File:wide.jpg', imageinfo: [{ thumburl: 'https://x/wide.jpg', width: 3000, height: 2000, mime: 'image/jpeg', descriptionurl: 'https://c/wide', extmetadata: { Artist: { value: 'Someone' }, LicenseShortName: { value: 'CC BY 4.0' } } }] },
      },
    })
    expect(await neighbourhoodPhoto(40.7434, -74.0055)).toMatchObject({ kind: 'neighbourhood', imageUrl: 'https://x/wide.jpg', credit: { author: 'Someone', license: 'CC BY 4.0' } })
  })

  it('returns null when there is no neighbourhood article, or no free photo for it', async () => {
    wikimedia({ areas: {} })
    expect(await neighbourhoodPhoto(0, 0)).toBeNull()
    wikimedia({ areas: geo, titles: { 1: { title: 'Chelsea, Manhattan' } } })
    expect(await neighbourhoodPhoto(40.7434, -74.0055)).toBeNull()
  })
})

describe('findCover', () => {
  it("prefers the place's own article, and only looks at the neighbourhood when there isn't one", async () => {
    const calls = wikimedia({ search: { 1: statue }, commonsFiles: { 'Statue.jpg': info() } })
    expect((await findCover('Statue of Liberty', 40.689, -74.044))?.kind).toBe('article')
    expect(calls.some((c) => c.includes('geosearch'))).toBe(false)

    const calls2 = wikimedia({ search: {}, areas: { 1: { title: 'Chelsea, Manhattan', description: 'Neighborhood in New York City', coordinates: [{ lat: 40.7465, lon: -74.0014 }] } }, titles: { 1: { title: 'Chelsea, Manhattan', pageimage: 'C.jpg', thumbnail: { source: 'https://x/c.jpg', width: 800, height: 600 } } }, commonsFiles: { 'C.jpg': info() } })
    expect((await findCover("Matt's House", 40.7434, -74.0055))?.kind).toBe('neighbourhood')
    expect(calls2.some((c) => c.includes('geosearch'))).toBe(true)
  })
})

describe('politeness and the image itself', () => {
  it('waits when told to slow down, then retries once', async () => {
    vi.useFakeTimers()
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(reply({ query: { pages: {} } }))
    vi.stubGlobal('fetch', f)
    const pending = articlePhoto('Statue of Liberty', 40.689, -74.044)
    await vi.advanceTimersByTimeAsync(1000)
    expect(f).toHaveBeenCalledTimes(1) // still waiting
    await vi.advanceTimersByTimeAsync(2000)
    expect(await pending).toBeNull()
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('fetches an image to keep, and refuses anything that is not a reasonably small image', async () => {
    vi.stubGlobal('fetch', async () => new Response(new Blob([new Uint8Array(1000)], { type: 'image/jpeg' })))
    expect((await fetchImage('https://x/a.jpg')).type).toBe('image/jpeg')
    vi.stubGlobal('fetch', async () => new Response(new Blob(['<html>'], { type: 'text/html' })))
    await expect(fetchImage('https://x/a.jpg')).rejects.toThrow(/unusable/)
    vi.stubGlobal('fetch', async () => new Response(new Blob([new Uint8Array(4 * 1024 * 1024)], { type: 'image/jpeg' })))
    await expect(fetchImage('https://x/a.jpg')).rejects.toThrow(/unusable/)
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }))
    await expect(fetchImage('https://x/a.jpg')).rejects.toThrow(/404/)
  })

  it('measures distance in kilometres', () => {
    expect(distanceKm([40.7, -74], [40.7, -74])).toBe(0)
    expect(distanceKm([51.47, -0.45], [40.64, -73.78])).toBeGreaterThan(5500)
    expect(distanceKm([51.47, -0.45], [40.64, -73.78])).toBeLessThan(5600)
  })
})
