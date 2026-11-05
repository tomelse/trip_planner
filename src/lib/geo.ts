const base = 'https://nominatim.openstreetmap.org'

export interface SearchResult {
  name: string
  address: string
  detail: string
  lat: number
  lng: number
}

export interface Resolved {
  name: string
  address: string
}

interface NominatimHit {
  name?: string
  display_name: string
  lat: string
  lon: string
  address?: Record<string, string>
}

function shortName(hit: NominatimHit): string {
  const a = hit.address ?? {}
  return hit.name || a.city || a.town || a.village || a.suburb || a.county || a.state || a.country || hit.display_name.split(',')[0]
}

/** "5 Avenue Anatole France, Paris, 75007, France" from Nominatim's structured address. */
function formatAddress(hit: NominatimHit): string {
  const a = hit.address ?? {}
  const street = [a.house_number, a.road ?? a.pedestrian ?? a.footway].filter(Boolean).join(' ')
  const city = a.city || a.town || a.village || a.municipality || a.suburb || a.county
  const parts = [street, city, a.postcode, a.country].filter(Boolean)
  return parts.length > 1 ? parts.join(', ') : hit.display_name
}

export async function search(q: string): Promise<SearchResult[]> {
  const res = await fetch(`${base}/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`)
  if (!res.ok) return []
  const hits: NominatimHit[] = await res.json()
  return hits.map((h) => ({
    name: shortName(h),
    address: formatAddress(h),
    detail: h.display_name,
    lat: Number(h.lat),
    lng: Number(h.lon),
  }))
}

export async function reverse(lat: number, lng: number): Promise<Resolved | null> {
  try {
    const res = await fetch(`${base}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`)
    if (!res.ok) return null
    const hit: NominatimHit = await res.json()
    return hit.display_name ? { name: shortName(hit), address: formatAddress(hit) } : null
  } catch {
    return null
  }
}
