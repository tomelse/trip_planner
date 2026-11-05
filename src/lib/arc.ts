import L from 'leaflet'

type LL = [number, number]

/**
 * Quadratic Bézier from a to b, bowed to the left of the direction of travel by `bend` × the distance between them.
 * Worked out in Web Mercator so the curve looks even at any latitude. Because "left" flips with direction,
 * A→B and B→A bow to opposite sides and never sit on top of each other.
 */
function curve(a: LL, b: LL, bend: number) {
  const crs = L.CRS.EPSG3857
  const p0 = crs.project(L.latLng(a[0], a[1]))
  const p2 = crs.project(L.latLng(b[0], b[1]))
  const dx = p2.x - p0.x
  const dy = p2.y - p0.y
  // Left normal in projected space (y points north).
  const c = L.point(p0.x + dx / 2 - dy * bend, p0.y + dy / 2 + dx * bend)
  const at = (t: number) => L.point(
    (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * c.x + t ** 2 * p2.x,
    (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * c.y + t ** 2 * p2.y,
  )
  const tangent = (t: number) => L.point(2 * (1 - t) * (c.x - p0.x) + 2 * t * (p2.x - c.x), 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p2.y - c.y))
  const ll = (p: L.Point): LL => {
    const x = crs.unproject(p)
    return [x.lat, x.lng]
  }
  return { at, tangent, ll, degenerate: dx === 0 && dy === 0 }
}

export function arcPoints(a: LL, b: LL, bend: number, steps = 32): LL[] {
  const k = curve(a, b, bend)
  if (k.degenerate) return [a, b]
  return Array.from({ length: steps + 1 }, (_, i) => k.ll(k.at(i / steps)))
}

/** Point along the arc and the screen rotation (degrees, 0 = pointing right) of the direction of travel there. */
export function arcArrow(a: LL, b: LL, bend: number, t = 0.58): { at: LL; angle: number } {
  const k = curve(a, b, bend)
  if (k.degenerate) return { at: a, angle: 0 }
  const d = k.tangent(t)
  // Mercator is conformal, so the direction is the same at every zoom; only y flips between map and screen.
  return { at: k.ll(k.at(t)), angle: Math.round((Math.atan2(-d.y, d.x) * 180) / Math.PI) }
}
