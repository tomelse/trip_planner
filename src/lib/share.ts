/** What Android hands us when a place is shared into the app (from Google Maps, a browser, a message...). */
export interface Shared {
  /** Best guess at the place's name: the share title, else the first line of the text. */
  name: string
  /** Text to geocode: the shared lines with links removed, e.g. "Eiffel Tower, Champ de Mars, Paris". */
  query: string
  /** Coordinates read straight out of a link, when it carries them. Exact, so preferred over searching. */
  coords: [number, number] | null
}

const NUM = '-?\\d{1,3}(?:\\.\\d+)?'
const URL_RE = /(?:https?:\/\/|geo:)[^\s<>"']+/gi

const COORD_PATTERNS = [
  new RegExp(`@(${NUM}),(${NUM})`), // google.com/maps/place/.../@48.85,2.29,17z
  new RegExp(`!3d(${NUM})!4d(${NUM})`), // google "data" parameter: the pin itself
  new RegExp(`[?&](?:q|ll|query|destination|daddr|center)=(${NUM}),(${NUM})`), // ?q=48.85,2.29 and friends
  new RegExp(`^geo:(${NUM}),(${NUM})`, 'i'), // geo:48.85,2.29 (Android's own map intent)
  new RegExp(`#map=\\d+/(${NUM})/(${NUM})`), // openstreetmap.org/#map=17/48.85/2.29
  new RegExp(`mlat=(${NUM})&mlon=(${NUM})`), // openstreetmap.org/?mlat=48.85&mlon=2.29
]

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Latitude, longitude from a map link, or null. (0, 0) is treated as "no location": it is what `geo:0,0?q=...` uses. */
export function coordsFromUrl(url: string): [number, number] | null {
  const u = safeDecode(url)
  for (const re of COORD_PATTERNS) {
    const m = u.match(re)
    if (!m) continue
    const lat = Number(m[1])
    const lng = Number(m[2])
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) return [lat, lng]
  }
  return null
}

/** A label carried in a link, e.g. `geo:0,0?q=Eiffel+Tower` or `maps.google.com/?q=Eiffel+Tower`. */
function labelFromUrl(url: string): string {
  const m = url.match(/[?&]q=([^&#]+)/)
  if (!m) return ''
  const text = safeDecode(m[1].replace(/\+/g, ' ')).trim()
  return new RegExp(`^${NUM},\\s*${NUM}$`).test(text) ? '' : text
}

export function parseShared(p: { title?: string | null; text?: string | null; url?: string | null }): Shared {
  const all = [p.title, p.text, p.url].filter((s): s is string => !!s && !!s.trim()).join('\n')
  const urls = all.match(URL_RE) ?? []
  const coords = urls.map(coordsFromUrl).find((c) => c !== null) ?? null

  const lines = [
    ...all.replace(URL_RE, '').split(/\r?\n/),
    ...urls.map(labelFromUrl),
  ]
    .map((l) => l.trim())
    .filter(Boolean)
  const unique = lines.filter((l, i) => lines.findIndex((x) => x.toLowerCase() === l.toLowerCase()) === i)

  const name = (p.title?.trim() || unique[0] || '').slice(0, 120)
  return { name, query: unique.join(', ').slice(0, 200), coords }
}
