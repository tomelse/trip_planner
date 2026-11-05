import type { Place } from './types'

/** Hues spread around the wheel and ordered so neighbours in the list look different. Slate is reserved for travel. */
export const PALETTE = [
  '#e03131', // red
  '#1c7ed6', // blue
  '#2f9e44', // green
  '#f76707', // orange
  '#9c36b5', // violet
  '#0ca5a5', // teal
  '#f0a500', // amber
  '#d6336c', // magenta
  '#4263eb', // indigo
  '#66a80f', // lime
  '#8c5a3c', // brown
]

/** The palette colour used by the fewest places, earliest in the list on ties. */
export function nextColor(places: Place[]): string {
  const uses = (c: string) => places.filter((p) => p.color === c).length
  return PALETTE.reduce((best, c) => (uses(c) < uses(best) ? c : best))
}
