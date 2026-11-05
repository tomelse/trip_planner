import { beforeEach, describe, expect, it } from 'vitest'
import { Focus, type Ref } from '../src/lib/focus.svelte'
import { detail, leg } from './helpers'

const P = (id: number): Ref => ({ type: 'place', id })
const L = (id: number): Ref => ({ type: 'leg', id })

let tab: string | null
let f: Focus
beforeEach(() => {
  tab = null
  const d = detail([leg(1, { from_place_id: 10, to_place_id: 11 }), leg(2, { from_place_id: 11, to_place_id: 10 }), leg(3)])
  f = new Focus(() => d, (r) => (tab = r.type === 'leg' ? 'travel' : 'places'))
})

describe('selection', () => {
  it('a click opens an item and shows its tab; a second click closes it', () => {
    f.toggle(P(10))
    expect(f.isSelected(P(10))).toBe(true)
    expect(tab).toBe('places')
    f.toggle(P(10))
    expect(f.selected).toBeNull()
  })

  it('only one thing is open at a time', () => {
    f.toggle(P(10))
    f.toggle(L(2))
    expect(f.isSelected(L(2))).toBe(true)
    expect(f.isSelected(P(10))).toBe(false)
    expect(tab).toBe('travel')
  })

  it('clearing the selection (Esc, empty map) closes it', () => {
    f.select(P(10))
    f.clearSelection()
    expect(f.selected).toBeNull()
  })
})

describe('hover', () => {
  it('hovering a place lights its linked legs, as rows, without previewing their lines', () => {
    f.hoverRef(P(10))
    expect(f.hovers(P(10))).toBe(true)
    expect(f.isHot(L(1)) && f.isHot(L(2))).toBe(true)
    expect(f.hovers(L(1))).toBe(false)
    expect(f.isHot(L(3))).toBe(false)
  })

  it('hovering a leg softly relates the places at its ends, and not other legs', () => {
    f.hoverRef(L(1))
    expect(f.isRelated(P(10)) && f.isRelated(P(11))).toBe(true)
    expect(f.hovers(P(10))).toBe(false)
    expect(f.isHot(L(2))).toBe(false)
    expect(f.hoveredLegId()).toBe(1)
  })

  it('an airport marker stands for its legs, not for the places they link to', () => {
    f.hoverSpot([1, 2])
    expect(f.hovers(L(1)) && f.hovers(L(2))).toBe(true)
    expect(f.hovers(L(3))).toBe(false)
    expect(f.isRelated(P(10))).toBe(false)
    expect(f.hoveredLegId()).toBeNull()
  })

  it('a late "leave" from an old row cannot undo a newer "enter"', () => {
    f.hoverRef(P(10))
    f.hoverRef(P(11))
    f.unhoverRef(P(10))
    expect(f.hovers(P(11))).toBe(true)
  })

  it('leaving a different target does not clear a marker hover', () => {
    f.hoverSpot([1])
    f.unhoverRef(L(1))
    expect(f.hover?.kind).toBe('spot')
    f.unhoverSpot()
    expect(f.hover).toBeNull()
  })

  it('knows which row the map is pointing at, and drops list hovers when asked', () => {
    f.hoverRef(L(1), 'map')
    expect(f.mapHoverId('leg')).toBe(1)
    expect(f.mapHoverId('place')).toBeNull()
    f.clearListHover()
    expect(f.hover).not.toBeNull()
    f.hoverRef(L(1), 'list')
    f.clearListHover()
    expect(f.hover).toBeNull()
    f.hoverSpot([5, 6])
    expect(f.mapHoverId('leg')).toBe(5)
  })
})

describe('edit mode', () => {
  it('opening shows details; Edit switches to the form; Done goes back', () => {
    f.toggle(P(10))
    expect(f.isEditing(P(10))).toBe(false)
    f.startEdit(P(10))
    expect(f.isEditing(P(10))).toBe(true)
    f.stopEdit()
    expect(f.isSelected(P(10)) && !f.isEditing(P(10))).toBe(true)
  })

  it('opening something else leaves edit mode, and reopening shows details again', () => {
    f.startEdit(P(10))
    f.toggle(L(1))
    expect(f.isEditing(P(10)) || f.isEditing(L(1))).toBe(false)
    f.select(P(10))
    expect(f.isEditing(P(10))).toBe(false)
  })

  it('a new item can open straight into its form', () => {
    f.startEdit(L(3))
    expect(f.isSelected(L(3)) && f.isEditing(L(3))).toBe(true)
    expect(tab).toBe('travel')
  })

  it('closing or deleting an item being edited resets', () => {
    f.startEdit(P(10))
    f.toggle(P(10))
    expect(f.selected).toBeNull()
    f.startEdit(P(10))
    f.hoverRef(P(10))
    f.forget(P(10))
    expect(f.selected === null && f.editing === null && f.hover === null).toBe(true)
  })
})
