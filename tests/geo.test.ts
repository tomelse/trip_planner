import { afterEach, describe, expect, it, vi } from 'vitest'
import { reverse, search } from '../src/lib/geo'

const reply = (body: unknown, status = 200) => vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }))
afterEach(() => vi.unstubAllGlobals())

// The shape Nominatim really returned for 450 West 17th Street.
const house = {
  lat: '40.7434010', lon: '-74.0054686', name: '',
  display_name: '450, West 17th Street, Robert Fulton Houses, Manhattan, New York, 10011, United States',
  address: { house_number: '450', road: 'West 17th Street', neighbourhood: 'Manhattan Community Board 4', suburb: 'Manhattan', city: 'New York', postcode: '10011', country: 'United States' },
}

describe('search', () => {
  it('names an address result by its address, not by the city it is in', async () => {
    vi.stubGlobal('fetch', reply([house]))
    const [r] = await search('450 w 17th st New York')
    expect(r.name).toBe('450 West 17th Street')
    expect(r.address).toBe('450 West 17th Street, New York, 10011, United States')
    expect([r.lat, r.lng]).toEqual([40.743401, -74.0054686])
  })

  it('sends the current view as a soft preference only', async () => {
    const f = reply([house])
    vi.stubGlobal('fetch', f)
    await search('x', [-74.1, 40.6, -73.9, 40.8])
    const url = String(f.mock.calls[0][0])
    expect(url).toContain('viewbox=-74.1,40.6,-73.9,40.8')
    expect(url).not.toContain('bounded')
    await search('x')
    expect(String(f.mock.calls[1][0])).not.toContain('viewbox')
  })

  it('keeps real names, and falls back to the city when there is neither name nor street', async () => {
    vi.stubGlobal('fetch', reply([{ lat: '1', lon: '2', name: 'Central Park', display_name: 'Central Park, New York', address: { city: 'New York' } }]))
    expect((await search('central park'))[0].name).toBe('Central Park')
    vi.stubGlobal('fetch', reply([{ lat: '1', lon: '2', display_name: 'Somewhere', address: { city: 'Springfield' } }]))
    expect((await search('q'))[0].name).toBe('Springfield')
  })

  it('tells a failing service (throws) from no matches (empty list)', async () => {
    vi.stubGlobal('fetch', reply({}, 503))
    await expect(search('x')).rejects.toThrow(/503/)
    vi.stubGlobal('fetch', reply([]))
    expect(await search('zzz')).toEqual([])
  })
})

describe('reverse', () => {
  it('names a bare road by its street and sends lat/lon the right way round', async () => {
    const f = reply({ display_name: 'West 17th Street, New York', name: '', address: { road: 'West 17th Street', city: 'New York', postcode: '10011', country: 'United States' } })
    vi.stubGlobal('fetch', f)
    const r = await reverse(40.743401, -74.0054686)
    expect(r).toEqual({ name: 'West 17th Street', address: 'West 17th Street, New York, 10011, United States' })
    expect(String(f.mock.calls[0][0])).toContain('lat=40.743401&lon=-74.0054686')
  })

  it('returns null rather than throwing when the service is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await reverse(1, 2)).toBeNull()
  })
})
