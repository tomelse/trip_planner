/** The nearest ancestor that really scrolls, never the page itself. */
function scroller(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

/**
 * Scroll `el` into view inside its own scrolling panel and nowhere else. The browser's scrollIntoView also scrolls
 * the page itself, and this page has no scrollbar to bring it back, so one call could leave the map and trip menu
 * pushed off the top for good. Honours the element's `scroll-margin-top` (room left for sticky bars).
 */
export function scrollWithin(el: HTMLElement, block: 'start' | 'nearest' = 'nearest') {
  const box = scroller(el)
  if (!box) return
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0
  const b = box.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  if (block === 'start' || r.top < b.top + margin) box.scrollTop += r.top - b.top - margin
  else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom
}

/** Scroll the row with this id into view inside `list`'s panel. */
export function revealRow(list: HTMLElement | undefined, id: number | null) {
  if (id === null) return
  const row = list?.querySelector<HTMLElement>(`[data-id="${id}"]`)
  if (row) scrollWithin(row)
}
