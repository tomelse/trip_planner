import L from 'leaflet'

type LocateState = 'off' | 'finding' | 'on'

// One icon style for all three buttons: 24px grid, round 2px strokes, drawn in the control's text colour.
const svg = (inner: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`
const PLUS = svg('<path d="M12 5v14M5 12h14"/>')
const MINUS = svg('<path d="M5 12h14"/>')
const LOCATE = svg('<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>')

/**
 * Zoom in, zoom out and "my location" as a single bar, so they share one set of looks. It replaces Leaflet's own
 * zoom control (same behaviour, including greying out at the zoom limits) and is styled in app.css.
 */
export class MapControls extends L.Control {
  private locateBtn!: HTMLAnchorElement
  private zoomIn!: HTMLAnchorElement
  private zoomOut!: HTMLAnchorElement
  private map!: L.Map

  constructor(private handlers: { onLocate: () => void }) {
    super({ position: 'bottomright' })
  }

  onAdd(map: L.Map) {
    this.map = map
    const bar = L.DomUtil.create('div', 'leaflet-bar leaflet-control')
    const button = (label: string, icon: string, extra: string, onClick: () => void) => {
      const a = L.DomUtil.create('a', `mc ${extra}`, bar)
      a.href = '#'
      a.setAttribute('role', 'button')
      a.setAttribute('aria-label', label)
      a.title = label
      a.innerHTML = icon
      L.DomEvent.on(a, 'click', (e) => {
        L.DomEvent.stop(e)
        if (!a.classList.contains('mc-disabled')) onClick()
      })
      return a
    }
    this.zoomIn = button('Zoom in', PLUS, 'mc-in', () => map.zoomIn())
    this.zoomOut = button('Zoom out', MINUS, 'mc-out', () => map.zoomOut())
    this.locateBtn = button('Show my location', LOCATE, 'mc-locate', () => this.handlers.onLocate())
    L.DomEvent.disableClickPropagation(bar)
    map.on('zoomend zoomlevelschange', this.refresh, this)
    this.refresh()
    return bar
  }

  onRemove(map: L.Map) {
    map.off('zoomend zoomlevelschange', this.refresh, this)
  }

  private refresh() {
    this.zoomIn.classList.toggle('mc-disabled', this.map.getZoom() >= this.map.getMaxZoom())
    this.zoomOut.classList.toggle('mc-disabled', this.map.getZoom() <= this.map.getMinZoom())
  }

  setLocate(state: LocateState) {
    const on = state !== 'off'
    this.locateBtn.classList.toggle('on', on)
    this.locateBtn.classList.toggle('finding', state === 'finding')
    this.locateBtn.setAttribute('aria-pressed', String(on))
    const label = on ? 'Hide my location' : 'Show my location'
    this.locateBtn.title = label
    this.locateBtn.setAttribute('aria-label', label)
  }
}

/** The "+ Add here" pill that stacks above the bar while your position is showing. */
export class HereControl extends L.Control {
  constructor(private handlers: { onClick: () => void }) {
    super({ position: 'bottomright' })
  }

  onAdd() {
    const box = L.DomUtil.create('div', 'leaflet-control here-ctl')
    const b = L.DomUtil.create('button', '', box)
    b.type = 'button'
    b.textContent = '+ Add here'
    b.title = 'Add your current position as a place'
    L.DomEvent.disableClickPropagation(box)
    L.DomEvent.on(b, 'click', () => this.handlers.onClick())
    return box
  }
}
