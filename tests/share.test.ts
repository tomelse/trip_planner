import { describe, expect, it } from 'vitest'
import { parseShared } from '../src/lib/share'
import { readLaunch } from '../src/lib/launch'

describe('parseShared', () => {
  it('uses the name and address text from a short Maps link, which carries no coordinates', () => {
    const r = parseShared({ text: 'Eiffel Tower\nChamp de Mars, 5 Av. Anatole France, 75007 Paris, France\nhttps://maps.app.goo.gl/AbCdEf123' })
    expect(r.coords).toBeNull()
    expect(r.name).toBe('Eiffel Tower')
    expect(r.query).toMatch(/Champ de Mars/)
    expect(r.query).not.toMatch(/goo\.gl/)
  })

  it('does not duplicate the title when it repeats the first line', () => {
    const r = parseShared({ title: 'Eiffel Tower', text: 'Eiffel Tower\nhttps://maps.app.goo.gl/xyz' })
    expect(r).toMatchObject({ name: 'Eiffel Tower', query: 'Eiffel Tower' })
  })

  it.each([
    ['@lat,lng in a place URL', 'https://www.google.com/maps/place/Eiffel+Tower/@48.8583701,2.2944813,17z/data=!3m1!4b1', [48.8583701, 2.2944813]],
    ['?q=lat,lng', 'https://maps.google.com/?q=48.8584,2.2945', [48.8584, 2.2945]],
    ['percent-encoded comma and a negative longitude', 'https://www.google.com/maps/dir/?api=1&destination=51.5007%2C-0.1246', [51.5007, -0.1246]],
    ['the !3d!4d data parameter', 'https://www.google.com/maps/place/X/data=!4m6!3m5!1s0x0!8m2!3d35.6586!4d139.7454', [35.6586, 139.7454]],
    ['a geo: URI', 'geo:35.6586,139.7454?q=Tokyo+Tower', [35.6586, 139.7454]],
    ['an OpenStreetMap #map link', 'https://www.openstreetmap.org/#map=17/51.5007/-0.1246', [51.5007, -0.1246]],
    ['an OpenStreetMap marker link', 'https://www.openstreetmap.org/?mlat=51.5&mlon=-0.12', [51.5, -0.12]],
  ])('reads coordinates from %s', (_, url, want) => {
    expect(parseShared({ text: url }).coords).toEqual(want)
  })

  it('treats geo:0,0 as "no location" and uses the label', () => {
    const r = parseShared({ text: 'geo:0,0?q=Eiffel+Tower' })
    expect(r.coords).toBeNull()
    expect(r.query).toBe('Eiffel Tower')
  })

  it('ignores out-of-range numbers, takes plain text as the query, and bounds long input', () => {
    expect(parseShared({ text: 'https://example.com/?q=999,999' }).coords).toBeNull()
    expect(parseShared({ text: 'just some words' })).toMatchObject({ name: 'just some words', query: 'just some words' })
    const long = parseShared({ title: 'x'.repeat(500), text: 'y'.repeat(500) })
    expect(long.name.length).toBeLessThanOrEqual(120)
    expect(long.query.length).toBeLessThanOrEqual(200)
  })
})

describe('readLaunch', () => {
  it('knows the icon shortcuts', () => {
    expect(readLaunch('')).toBeNull()
    expect(readLaunch('?action=new-trip')).toEqual({ kind: 'new-trip' })
    expect(readLaunch('?action=itinerary')).toEqual({ kind: 'tab', tab: 'calendar', agenda: true })
    expect(readLaunch('?action=travel')).toEqual({ kind: 'tab', tab: 'travel' })
    expect(readLaunch('?action=boom')).toBeNull()
  })

  it('turns share-target parameters into a shared place', () => {
    const r = readLaunch('?title=Eiffel%20Tower&text=Eiffel%20Tower%0Ahttps%3A%2F%2Fmaps.app.goo.gl%2Fabc&url=')
    expect(r).toMatchObject({ kind: 'share', shared: { name: 'Eiffel Tower', coords: null } })
    const exact = readLaunch('?text=' + encodeURIComponent('https://maps.google.com/?q=1.5,2.5'))
    expect(exact).toMatchObject({ kind: 'share', shared: { coords: [1.5, 2.5] } })
  })
})
