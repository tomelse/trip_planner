/**
 * Free photos for a place, from Wikipedia and Wikimedia Commons (no key, no server).
 *
 *   1. the photo from the place's own Wikipedia article, if it has one (landmarks, venues), else
 *   2. the photo of the neighbourhood it is in (so an ordinary address still gets a picture of its surroundings).
 *
 * Only files hosted on Commons are used: Wikipedia's other pictures (film posters, logos) are non-free and may not
 * be reused. Every photo carries the credit its licence requires.
 */

export type CoverKind = 'article' | 'neighbourhood'

export interface CoverCredit {
  author: string
  /** "CC BY-SA 4.0", "CC0"... */
  license: string
  licenseUrl?: string
  /** The photo's page on Commons (history, full licence). */
  pageUrl: string
  from: string
}

export interface CoverPhoto {
  kind: CoverKind
  /** What the photo is of: the article ("Statue of Liberty") or the neighbourhood ("Chelsea, Manhattan"). */
  subject: string
  /** An 800 px wide copy, which is what gets stored. */
  imageUrl: string
  width: number
  height: number
  credit: CoverCredit
}

const WIKI = 'https://en.wikipedia.org/w/api.php'
const COMMONS = 'https://commons.wikimedia.org/w/api.php'
const WIKIDATA = 'https://www.wikidata.org/w/api.php'
const ARTICLE_RADIUS_KM = 25

// ---------------------------------------------------------------- plumbing

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
/** Commons credits arrive as HTML; keep just the words. */
const plain = (html = '') => decode(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()

export function distanceKm(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180
  const h = Math.sin(((b[0] - a[0]) * r) / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** GET JSON. If Wikimedia says "slow down" (429), wait the time it asks for and try once more. */
async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url)
    if (res.status === 429 && attempt === 0) {
      const wait = Math.min(Number(res.headers.get('retry-after')) || 5, 15)
      await new Promise((r) => setTimeout(r, wait * 1000 + 250))
      continue
    }
    if (!res.ok) throw new Error(`${new URL(url).host}: ${res.status}`)
    return res.json()
  }
}

const q = (params: Record<string, string>) => new URLSearchParams({ format: 'json', origin: '*', ...params }).toString()

// ---------------------------------------------------------------- is this article about this place?

const STOP = new Set(['the', 'of', 'and', 'a', 'an', 'in', 'at'])
const tokens = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, ' ').split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t))

/** Search matches loosely ("Matt's House" finds something), so insist the title and the place name overlap fully. */
export function sameThing(placeName: string, title: string) {
  const a = tokens(placeName)
  const b = new Set(tokens(title))
  if (!a.length || !b.size) return false
  const aSet = new Set(a)
  return a.every((t) => b.has(t)) || [...b].every((t) => aSet.has(t))
}

// ---------------------------------------------------------------- a photo's licence, from Commons

interface CommonsInfo {
  query?: { pages: Record<string, { imageinfo?: { descriptionurl: string; width: number; height: number; mime: string; extmetadata?: Record<string, { value: string }> }[] }> }
}

/** Credit for a file, or null when it isn't a usable free photo on Commons. */
export async function commonsCredit(fileName: string): Promise<CoverCredit | null> {
  const data = await getJson<CommonsInfo>(
    `${COMMONS}?${q({
      action: 'query',
      titles: `File:${fileName}`,
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl',
    })}`,
  )
  const info = Object.values(data.query?.pages ?? {})[0]?.imageinfo?.[0]
  if (!info || !['image/jpeg', 'image/png', 'image/webp'].includes(info.mime)) return null
  const m = info.extmetadata ?? {}
  return {
    author: plain(m.Artist?.value) || 'Unknown author',
    license: plain(m.LicenseShortName?.value) || 'See file page',
    licenseUrl: m.LicenseUrl?.value,
    pageUrl: info.descriptionurl,
    from: 'Wikimedia Commons',
  }
}

// ---------------------------------------------------------------- 1. the place's own article

interface WikiPage {
  title: string
  index?: number
  pageimage?: string
  thumbnail?: { source: string; width: number; height: number }
  coordinates?: { lat: number; lon: number }[]
  description?: string
  pageprops?: { wikibase_item?: string }
}

export async function articlePhoto(name: string, lat: number, lng: number): Promise<CoverPhoto | null> {
  const data = await getJson<{ query?: { pages: Record<string, WikiPage> } }>(
    `${WIKI}?${q({
      action: 'query', generator: 'search', gsrsearch: name, gsrlimit: '5',
      prop: 'pageimages|coordinates', piprop: 'thumbnail|name', pithumbsize: '800', colimit: 'max',
    })}`,
  )
  const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  const candidates = pages.filter((p) => {
    const c = p.coordinates?.[0]
    return p.thumbnail && p.pageimage && c && sameThing(name, p.title) && distanceKm([lat, lng], [c.lat, c.lon]) < ARTICLE_RADIUS_KM
  })
  for (const p of candidates.slice(0, 2)) {
    const credit = await commonsCredit(p.pageimage!)
    if (credit) return { kind: 'article', subject: p.title, imageUrl: p.thumbnail!.source, width: p.thumbnail!.width, height: p.thumbnail!.height, credit }
  }
  return null
}

// ---------------------------------------------------------------- 2. the neighbourhood

/** "Neighborhood in New York City": what Wikipedia's one-line description says about an area article. */
const AREA_FIRST = /^(?:sub-)?(?:neighbou?rhood|district|suburb|quarter|locality|village|borough|hamlet)\b/i
const AREA_ANY = /neighbou?rhood|suburb|quarter|locality|village|hamlet/i
/** Historic districts, community boards and the like are administrative or protected areas, not places people picture. */
const NOT_AREA = /historic district|community board|school district|council|station/i

export interface AreaGuess { title: string; description: string; km: number }

/** Neighbourhood-type articles near the pin, best first ("Neighborhood in ..." before looser matches, then nearest). */
export async function areasNear(lat: number, lng: number): Promise<AreaGuess[]> {
  // Articles near a pin are mostly buildings, so ask for a lot of them and pick out the neighbourhood-type ones.
  const data = await getJson<{ query?: { pages: Record<string, WikiPage> } }>(
    `${WIKI}?${q({
      action: 'query', generator: 'geosearch', ggscoord: `${lat}|${lng}`, ggsradius: '3000', ggslimit: '500',
      prop: 'description|coordinates', colimit: 'max',
    })}`,
  )
  return Object.values(data.query?.pages ?? {})
    .filter((p) => p.coordinates?.[0] && p.description && !NOT_AREA.test(p.title) && !NOT_AREA.test(p.description) && AREA_ANY.test(p.description))
    .map((p) => ({ title: p.title, description: p.description!, km: distanceKm([lat, lng], [p.coordinates![0].lat, p.coordinates![0].lon]), strong: AREA_FIRST.test(p.description!) }))
    .sort((a, b) => Number(b.strong) - Number(a.strong) || a.km - b.km)
    .map(({ title, description, km }) => ({ title, description, km }))
}

interface CommonsPages { query?: { pages: Record<string, { title: string; imageinfo?: { thumburl: string; width: number; height: number; mime: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] }> } }

/** The first usable photo filed under a Commons category: pictures filed as being *of* the neighbourhood. */
async function categoryPhoto(category: string): Promise<{ imageUrl: string; width: number; height: number; credit: CoverCredit } | null> {
  const data = await getJson<CommonsPages>(
    `${COMMONS}?${q({
      action: 'query', generator: 'categorymembers', gcmtitle: category.startsWith('Category:') ? category : `Category:${category}`,
      gcmtype: 'file', gcmlimit: '50', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '800',
      iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl',
    })}`,
  )
  for (const p of Object.values(data.query?.pages ?? {})) {
    const ii = p.imageinfo?.[0]
    if (!ii || !['image/jpeg', 'image/png', 'image/webp'].includes(ii.mime) || ii.width < 1000) continue
    const shape = ii.width / ii.height
    if (shape < 1.2 || shape > 2.2) continue // a banner-shaped crop wants a landscape photo
    const m = ii.extmetadata ?? {}
    return {
      imageUrl: ii.thumburl, width: ii.width, height: ii.height,
      credit: { author: plain(m.Artist?.value) || 'Unknown author', license: plain(m.LicenseShortName?.value) || 'See file page', licenseUrl: m.LicenseUrl?.value, pageUrl: ii.descriptionurl, from: 'Wikimedia Commons' },
    }
  }
  return null
}

export async function neighbourhoodPhoto(lat: number, lng: number): Promise<CoverPhoto | null> {
  const area = (await areasNear(lat, lng))[0]
  if (!area) return null
  const info = await getJson<{ query?: { pages: Record<string, WikiPage> } }>(
    `${WIKI}?${q({ action: 'query', titles: area.title, prop: 'pageimages|pageprops', piprop: 'thumbnail|name', pithumbsize: '800', ppprop: 'wikibase_item' })}`,
  )
  const page = Object.values(info.query?.pages ?? {})[0]
  if (!page) return null

  // The article's own photo, when it is a free one...
  if (page.thumbnail && page.pageimage) {
    const credit = await commonsCredit(page.pageimage)
    if (credit) return { kind: 'neighbourhood', subject: area.title, imageUrl: page.thumbnail.source, width: page.thumbnail.width, height: page.thumbnail.height, credit }
  }
  // ...else a photo from its Commons category (Wikidata names the category, property P373).
  const item = page.pageprops?.wikibase_item
  if (!item) return null
  const claims = await getJson<{ claims?: { P373?: { mainsnak: { datavalue?: { value: string } } }[] } }>(
    `${WIKIDATA}?${q({ action: 'wbgetclaims', entity: item, property: 'P373' })}`,
  )
  const category = claims.claims?.P373?.[0]?.mainsnak.datavalue?.value
  const photo = category ? await categoryPhoto(category) : null
  return photo ? { kind: 'neighbourhood', subject: area.title, ...photo } : null
}

// ---------------------------------------------------------------- putting it together

/** The photo for a place: its own article's, else its neighbourhood's, else nothing. */
export async function findCover(name: string, lat: number, lng: number): Promise<CoverPhoto | null> {
  return (await articlePhoto(name, lat, lng)) ?? (await neighbourhoodPhoto(lat, lng))
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024

/** The image itself, so it can be kept on the device and shown offline. */
export async function fetchImage(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`image: ${res.status}`)
  const blob = await res.blob()
  if (!blob.type.startsWith('image/') || blob.size > MAX_IMAGE_BYTES) throw new Error('image: unusable')
  return blob
}
