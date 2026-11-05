import type { TripDetail } from './types'

/** Anything on the map or in a list that can be hovered or opened. */
export type Ref = { type: 'place' | 'leg'; id: number }

const same = (a: Ref, b: Ref) => a.type === b.type && a.id === b.id

type Source = 'list' | 'map'
type Hover = { kind: 'place' | 'leg'; id: number; source: Source } | { kind: 'spot'; ids: number[]; source: Source }

/**
 * The one place that decides what is hovered and what is open, so lists, calendar, itinerary and map agree.
 *
 * - Hover: pointing at a row, pin, line or airport marker lights up everything that stands for it, everywhere.
 * - Selection: at most one place or leg is open. Clicking opens it (and shows its tab); clicking it again closes it.
 */
export class Focus {
  selected = $state<Ref | null>(null)
  hover = $state<Hover | null>(null)
  /** The open item is showing its edit form rather than its details. Always the selected item, or nothing. */
  editing = $state<Ref | null>(null)

  constructor(
    private detail: () => TripDetail | null,
    /** Called when something is opened, so the sidebar can show the tab it lives in. */
    private reveal: (ref: Ref) => void,
  ) {}

  // ---- selection

  isSelected(ref: Ref) {
    return this.selected?.type === ref.type && this.selected.id === ref.id
  }

  select(ref: Ref) {
    if (this.editing && !same(this.editing, ref)) this.editing = null
    this.selected = ref
    this.reveal(ref)
  }

  /** What a click does: open it, or close it if it is already open. */
  toggle(ref: Ref) {
    if (this.isSelected(ref)) this.clearSelection()
    else this.select(ref)
  }

  clearSelection() {
    this.selected = null
    this.editing = null
  }

  // ---- editing: opening something shows its details; editing is a deliberate second step

  isEditing(ref: Ref) {
    return this.isSelected(ref) && !!this.editing && same(this.editing, ref)
  }

  /** Open the item (if it isn't) and switch it to its edit form. */
  startEdit(ref: Ref) {
    if (!this.isSelected(ref)) this.select(ref)
    this.editing = ref
  }

  stopEdit() {
    this.editing = null
  }

  // ---- hover

  hoverRef(ref: Ref, source: Source = 'list') {
    this.hover = { kind: ref.type, id: ref.id, source }
  }

  hoverSpot(ids: number[], source: Source = 'map') {
    this.hover = { kind: 'spot', ids, source }
  }

  /** Only clears if `ref` is still what is hovered, so a late "leave" can't undo a newer "enter". */
  unhoverRef(ref: Ref) {
    const h = this.hover
    if (h && h.kind === ref.type && h.id === ref.id) this.hover = null
  }

  unhoverSpot() {
    if (this.hover?.kind === 'spot') this.hover = null
  }

  /** Drop a hover that came from a list, e.g. when the list is swapped out. A map hover stays: the pointer is still there. */
  clearListHover() {
    if (this.hover?.source === 'list') this.hover = null
  }

  /** Forget everything about a deleted or switched-away item. */
  forget(ref: Ref) {
    if (this.isSelected(ref)) this.clearSelection()
    this.unhoverRef(ref)
  }

  reset() {
    this.selected = null
    this.editing = null
    this.hover = null
  }

  /** The thing itself is under the pointer (a spot marker counts for each of its legs). Drives pins and line previews. */
  hovers(ref: Ref) {
    const h = this.hover
    if (!h) return false
    if (h.kind === 'spot') return ref.type === 'leg' && h.ids.includes(ref.id)
    return h.kind === ref.type && h.id === ref.id
  }

  /**
   * Linked to what is hovered without being it, in both directions: the legs of a hovered place, and the places at
   * the ends of a hovered leg. (A hovered airport marker stands for its legs, not for the places they link to.)
   */
  isRelated(ref: Ref) {
    const h = this.hover
    if (h?.kind === 'place' && ref.type === 'leg') {
      const leg = this.detail()?.legs.find((l) => l.id === ref.id)
      return !!leg && (leg.from_place_id === h.id || leg.to_place_id === h.id)
    }
    if (h?.kind === 'leg' && ref.type === 'place') {
      const leg = this.detail()?.legs.find((l) => l.id === h.id)
      return !!leg && (leg.from_place_id === ref.id || leg.to_place_id === ref.id)
    }
    return false
  }

  /** Hovered or related. Drives row highlights. */
  isHot(ref: Ref) {
    return this.hovers(ref) || this.isRelated(ref)
  }

  /** The leg itself under the pointer (not via an airport marker), if any. */
  hoveredLegId(): number | null {
    return this.hover?.kind === 'leg' ? this.hover.id : null
  }

  /** Id of this type being hovered on the map, so its row can be scrolled into view. */
  mapHoverId(type: Ref['type']): number | null {
    const h = this.hover
    if (h?.source !== 'map') return null
    if (h.kind === type) return h.id
    return h.kind === 'spot' && type === 'leg' ? (h.ids[0] ?? null) : null
  }
}
