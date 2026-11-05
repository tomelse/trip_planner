<script lang="ts">
  import L from 'leaflet'
  import 'leaflet/dist/leaflet.css'
  import { onMount, untrack } from 'svelte'
  import { store } from '../lib/store.svelte'
  import type { Place } from '../lib/types'
  import type { Ref } from '../lib/focus.svelte'
  import { endpoint, legBends, legTitle, modeLabel } from '../lib/legs'
  import { arcArrow, arcPoints } from '../lib/arc'
  import { HereControl, MapControls } from '../lib/mapControls'
  import SearchBox from './SearchBox.svelte'
  import TripBar from './TripBar.svelte'

  const focus = store.focus
  const placeRef = (id: number): Ref => ({ type: 'place', id })
  const legRef = (id: number): Ref => ({ type: 'leg', id })

  let el: HTMLDivElement
  let map: L.Map | undefined = $state()
  // Off until you turn it on, then remembered, so a stray click or tap never drops a pin by surprise.
  const PIN_KEY = 'trips:pin-mode'
  let pinMode = $state(
    (() => {
      try {
        return localStorage.getItem(PIN_KEY) === 'on'
      } catch {
        return false
      }
    })(),
  )
  $effect(() => {
    try {
      localStorage.setItem(PIN_KEY, pinMode ? 'on' : 'off')
    } catch {}
  })
  let fittedTrip = -1

  // ---- My location: a blue dot that follows you, and a button to add where you are as a place.
  type Locate = 'off' | 'finding' | 'on'
  let locate = $state<Locate>('off')
  let fix = $state<{ lat: number; lng: number } | null>(null)
  let watchId: number | null = null
  let meDot: L.CircleMarker | undefined
  let meAccuracy: L.Circle | undefined
  let centreOnNextFix = true
  let controls: MapControls | undefined
  let hereControl: HereControl | undefined

  function onFix(pos: GeolocationPosition) {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords
    fix = { lat, lng }
    locate = 'on'
    if (!map) return
    if (!meDot || !meAccuracy) {
      meAccuracy = L.circle([lat, lng], { radius: accuracy, className: 'me-acc', interactive: false }).addTo(map)
      meDot = L.circleMarker([lat, lng], { radius: 8, className: 'me-dot', interactive: false }).addTo(map)
    } else {
      meAccuracy.setLatLng([lat, lng]).setRadius(accuracy)
      meDot.setLatLng([lat, lng])
    }
    // Zoom to you on the first fix only; after that the dot moves but the map stays where you put it.
    if (centreOnNextFix) {
      centreOnNextFix = false
      map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 0.6 })
    }
  }

  function onLocateError(err: GeolocationPositionError) {
    stopLocate()
    store.notify(
      err.code === err.PERMISSION_DENIED
        ? 'Location is blocked for this site. Allow it in your browser’s site settings.'
        : err.code === err.TIMEOUT
          ? 'Finding your location timed out. Try again outdoors or with a better signal.'
          : 'Could not work out your location.',
    )
  }

  const watch = () =>
    (watchId = navigator.geolocation.watchPosition(onFix, onLocateError, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    }))

  function startLocate() {
    if (!('geolocation' in navigator)) return store.notify('This browser can’t share your location.')
    locate = 'finding'
    centreOnNextFix = true
    watch()
  }

  function stopLocate() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId)
    watchId = null
    meDot?.remove()
    meAccuracy?.remove()
    meDot = meAccuracy = undefined
    fix = null
    locate = 'off'
  }

  function addHere() {
    if (!fix) return
    if (!store.current) return store.notify('Create a trip first.')
    store.addPlace(fix.lat, fix.lng)
  }

  // The location button shows whether tracking is on; the "+ Add here" pill exists only while there is a fix.
  $effect(() => {
    if (!map) return
    controls?.setLocate(locate)
    if (fix && !hereControl) hereControl = new HereControl({ onClick: addHere }).addTo(map)
    else if (!fix && hereControl) {
      hereControl.remove()
      hereControl = undefined
    }
  })

  // GPS drains the battery, so stop listening while the app is out of sight and resume when it is back.
  $effect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId)
        watchId = null
      } else if (locate !== 'off' && watchId === null) watch()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  })
  let layersEl: HTMLDivElement | undefined = $state()

  type Base = 'standard' | 'transit'
  const LAYERS_KEY = 'trips:layers'
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(LAYERS_KEY) ?? '{}') as { base?: Base; rail?: boolean }
    } catch {
      return {}
    }
  })()
  let base = $state<Base>(saved.base === 'transit' ? 'transit' : 'standard')
  let rail = $state(saved.rail === true)
  let baseLayers: Record<Base, L.TileLayer> | undefined
  let railLayer: L.TileLayer | undefined

  // ---- Layers on the map. Each effect below owns one kind and keeps it in sync with the store.
  /** Place pins. Only the colour is baked into the icon; selected/hovered/dimmed are classes set by paintPins(). */
  const pins = new Map<number, { marker: L.Marker; color: string }>()
  /** Airport/station markers, keyed by coordinate, and the legs that use each (read by the handlers). */
  const spots = new Map<string, L.Marker>()
  const spotLegIds = new Map<string, number[]>()
  /** Each leg is a visible arc, a wide invisible line that takes the hover and clicks, and a direction arrowhead. */
  interface LegLayers {
    line: L.Polyline
    hit: L.Polyline
    arrow: L.Marker
    angle: number
  }
  const legLayers = new Map<number, LegLayers>()

  onMount(() => {
    // A finger moves a few pixels on any tap; don't let that count as dragging a pin (or the map).
    if (coarse()) (L.Draggable.prototype as unknown as { options: { clickTolerance: number } }).options.clickTolerance = 12
    const m = L.map(el, { zoomControl: false, worldCopyJump: true }).setView([30, 10], 2)
    controls = new MapControls({ onLocate: () => (locate === 'off' ? startLocate() : stopLocate()) }).addTo(m)
    const osm = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    baseLayers = {
      // crossOrigin makes the tile request CORS, so the service worker can cache real (not opaque) responses.
      standard: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: osm, crossOrigin: true }),
      transit: L.tileLayer('https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: `Map <a href="https://memomaps.de">memomaps.de</a> · ${osm}`,
      }),
    }
    railLayer = L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abc',
      attribution: '<a href="https://www.openrailwaymap.org">OpenRailwayMap</a>',
    })
    // Empty map: drop a pin if that mode is on, otherwise close whatever is open.
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (pinMode && store.current) store.addPlace(e.latlng.lat, e.latlng.lng)
      else focus.clearSelection()
    })
    // The pane changes size with the layout (rotation, expanding the map), so keep Leaflet in sync.
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(el)
    map = m
    return () => {
      stopLocate()
      controls?.remove()
      ro.disconnect()
      m.remove()
    }
  })

  const coarse = () => matchMedia('(pointer: coarse)').matches
  /** Dragging a pin further than this means it now marks a different place, so its address is looked up again. */
  const FAR_DRAG_M = 150

  const NOTES_MAX = 140

  /** Built as DOM nodes so place names and addresses are never parsed as HTML. */
  function tooltip(p: Place) {
    const el = document.createElement('div')
    const name = document.createElement('strong')
    name.textContent = p.name
    el.append(name)
    if (p.address) {
      const addr = document.createElement('div')
      addr.className = 'tip-addr'
      addr.textContent = p.address
      el.append(addr)
    }
    const notes = p.notes.trim()
    if (notes) {
      const n = document.createElement('div')
      n.className = 'tip-notes'
      n.textContent = notes.length > NOTES_MAX ? `${notes.slice(0, NOTES_MAX).trimEnd()}…` : notes
      el.append(n)
    }
    return el
  }

  function arrowIcon(angle: number) {
    return L.divIcon({
      className: 'leg-arrow-wrap',
      html: `<span class="leg-arrow" style="transform: rotate(${angle}deg)"></span>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    })
  }

  function pinIcon(color: string) {
    return L.divIcon({
      className: 'pin-wrap',
      html: `<span class="pin" style="--c:${color}"></span>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    })
  }

  // Swap the base map and toggle the rail overlay.
  $effect(() => {
    if (!map || !baseLayers || !railLayer) return
    for (const [name, layer] of Object.entries(baseLayers)) {
      if (name === base) {
        if (!map.hasLayer(layer)) map.addLayer(layer)
        layer.bringToBack()
      } else map.removeLayer(layer)
    }
    if (rail) map.addLayer(railLayer)
    else map.removeLayer(railLayer)
    try {
      localStorage.setItem(LAYERS_KEY, JSON.stringify({ base, rail }))
    } catch {}
  })

  // ---- Place pins

  /** Selected / hovered / filtered-out look of every pin. Cheap, and safe to run whenever focus changes. */
  function paintPins() {
    const filter = store.categoryFilter
    for (const p of store.current?.places ?? []) {
      const pin = pins.get(p.id)
      if (!pin) continue
      const selected = focus.isSelected(placeRef(p.id))
      const hot = focus.hovers(placeRef(p.id))
      const dot = pin.marker.getElement()?.querySelector('.pin')
      dot?.classList.toggle('sel', selected)
      dot?.classList.toggle('hot', hot)
      // A softer halo for the places at the ends of a hovered leg.
      dot?.classList.toggle('near', focus.isRelated(placeRef(p.id)))
      // On a touchscreen a pin only drags once it is open, so tapping or scrolling past one can't move it.
      if (coarse()) selected ? pin.marker.dragging?.enable() : pin.marker.dragging?.disable()
      pin.marker.setZIndexOffset(hot ? 2000 : selected ? 1000 : 0)
      pin.marker.setOpacity(!filter || p.category === filter ? 1 : 0.2)
    }
  }

  // Create, move and remove pins to match the trip's places.
  $effect(() => {
    if (!map) return
    const places = store.current?.places ?? []
    const live = new Set(places.map((p) => p.id))

    for (const [id, pin] of pins) {
      if (!live.has(id)) {
        pin.marker.remove()
        pins.delete(id)
      }
    }
    for (const p of places) {
      let pin = pins.get(p.id)
      if (!pin) {
        const marker = L.marker([p.lat, p.lng], { draggable: true, icon: pinIcon(p.color) }).addTo(map)
        marker.on('click', () => focus.toggle(placeRef(p.id)))
        marker.on('mouseover', () => focus.hoverRef(placeRef(p.id), 'map'))
        marker.on('mouseout', () => focus.unhoverRef(placeRef(p.id)))
        let from = marker.getLatLng()
        marker.on('dragstart', () => (from = marker.getLatLng()))
        marker.on('dragend', () => {
          const to = marker.getLatLng()
          store.patchPlace(p.id, { lat: to.lat, lng: to.lng })
          // A nudge keeps the address you have (looking up the pin's own spot can give a neighbour's door number);
          // a long drag moves it to somewhere else, so only then is the address replaced.
          if (from.distanceTo(to) > FAR_DRAG_M) store.refreshAddress(p.id)
        })
        marker.bindTooltip(tooltip(p), { direction: 'top', offset: [0, -8] })
        pin = { marker, color: p.color }
        pins.set(p.id, pin)
      }
      const ll = pin.marker.getLatLng()
      if (ll.lat !== p.lat || ll.lng !== p.lng) pin.marker.setLatLng([p.lat, p.lng])
      if (pin.color !== p.color) {
        pin.marker.setIcon(pinIcon(p.color))
        pin.color = p.color
      }
      pin.marker.setTooltipContent(tooltip(p))
    }
    untrack(paintPins)
  })

  // Restyle pins as hover, selection or the category filter change.
  $effect(paintPins)

  /** Soft halo on the airport/station markers at the ends of a hovered leg. */
  function paintSpots() {
    const leg = focus.hoveredLegId()
    for (const [key, mk] of spots) {
      const near = leg !== null && !!spotLegIds.get(key)?.includes(leg)
      mk.getElement()?.querySelector('.pin')?.classList.toggle('near', near)
    }
  }

  // ---- Airport / station markers; legs sharing a spot share a marker.
  $effect(() => {
    if (!map) return
    const found = new Map<string, { latlng: [number, number]; title: string; legs: string[]; legIds: number[] }>()
    for (const l of store.current?.legs ?? []) {
      for (const end of ['from', 'to'] as const) {
        const lat = l[`${end}_lat` as const]
        const lng = l[`${end}_lng` as const]
        if (lat === null || lng === null) continue
        const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
        const spot = found.get(key) ?? { latlng: [lat, lng] as [number, number], title: '', legs: [], legIds: [] }
        spot.title ||= l[`${end}_name` as const] || key
        spot.legs.push(`${modeLabel(l.mode)} · ${legTitle(l)}`)
        if (!spot.legIds.includes(l.id)) spot.legIds.push(l.id)
        found.set(key, spot)
      }
    }
    for (const [key, mk] of spots) {
      if (!found.has(key)) {
        mk.remove()
        spots.delete(key)
      }
    }
    spotLegIds.clear()
    for (const [key, spot] of found) spotLegIds.set(key, spot.legIds)
    for (const [key, spot] of found) {
      const el = document.createElement('div')
      const strong = document.createElement('strong')
      strong.textContent = spot.title
      el.append(strong)
      for (const text of [...new Set(spot.legs)].slice(0, 4)) {
        const line = document.createElement('div')
        line.className = 'tip-addr'
        line.textContent = text
        el.append(line)
      }
      let mk = spots.get(key)
      if (!mk) {
        mk = L.marker(spot.latlng, {
          icon: L.divIcon({
            className: 'pin-wrap',
            html: '<span class="pin transit" style="--c:var(--travel)"></span>',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
        }).addTo(map)
        mk.bindTooltip(el, { direction: 'top', offset: [0, -8] })
        // Read through spotLegIds so the handlers stay right when legs are added or removed later.
        mk.on('click', () => {
          const first = spotLegIds.get(key)?.[0]
          if (first !== undefined) focus.toggle(legRef(first))
        })
        mk.on('mouseover', () => focus.hoverSpot(spotLegIds.get(key) ?? [], 'map'))
        mk.on('mouseout', () => focus.unhoverSpot())
        spots.set(key, mk)
      } else mk.setTooltipContent(el)
    }
    untrack(paintSpots)
  })

  $effect(paintSpots)

  // ---- Leg arcs
  // Shown on the Travel tab, or as a preview while a leg (or its airport marker) is hovered from anywhere.
  $effect(() => {
    if (!map) return
    const legs = store.current?.legs ?? []
    const places = store.current?.places ?? []
    const bends = legBends(legs, places)
    const all = store.tab === 'travel'
    const emphasised = (id: number) => focus.isHot(legRef(id)) || focus.isSelected(legRef(id))
    const anyEmphasised = legs.some((l) => emphasised(l.id))
    const live = new Set<number>()
    for (const l of legs) {
      if (!all && !focus.hovers(legRef(l.id))) continue
      const a = endpoint(l, 'from', places)
      const b = endpoint(l, 'to', places)
      if (!a || !b) continue
      live.add(l.id)
      const bend = bends.get(l.id) ?? 0.18
      const pts = arcPoints(a, b, bend)
      const { at, angle } = arcArrow(a, b, bend)
      const label = `${modeLabel(l.mode)} · ${legTitle(l)}${l.depart_time ? ` · ${l.depart_time}` : ''}`
      let layers = legLayers.get(l.id)
      if (!layers) {
        const line = L.polyline(pts, { className: 'leg-line', interactive: false }).addTo(map)
        // Wider than the drawn line so thin arcs are easy to hit; bubbling off so a click here can't also drop a pin.
        const hit = L.polyline(pts, { weight: 12, opacity: 0, bubblingMouseEvents: false }).addTo(map)
        hit.bindTooltip(label, { sticky: true })
        hit.on('click', () => focus.toggle(legRef(l.id)))
        hit.on('mouseover', () => focus.hoverRef(legRef(l.id), 'map'))
        hit.on('mouseout', () => focus.unhoverRef(legRef(l.id)))
        const arrow = L.marker(at, { icon: arrowIcon(angle), interactive: false, keyboard: false, zIndexOffset: -500 }).addTo(map)
        layers = { line, hit, arrow, angle }
        legLayers.set(l.id, layers)
      } else {
        layers.line.setLatLngs(pts)
        layers.hit.setLatLngs(pts)
        layers.hit.setTooltipContent(label)
        layers.arrow.setLatLng(at)
        if (layers.angle !== angle) {
          layers.arrow.setIcon(arrowIcon(angle))
          layers.angle = angle
        }
      }
      // Emphasise the hovered/selected leg(s) and fade the rest.
      const hot = emphasised(l.id)
      const opacity = hot || !anyEmphasised ? 0.9 : 0.65
      layers.line.setStyle({ weight: hot ? 3.5 : 2.5, opacity })
      layers.arrow.setOpacity(opacity)
      if (hot) layers.line.bringToFront()
    }
    for (const [id, layers] of legLayers) {
      if (!live.has(id)) {
        layers.line.remove()
        layers.hit.remove()
        layers.arrow.remove()
        legLayers.delete(id)
      }
    }
  })

  // ---- Camera

  // Frame the whole trip when switching trips.
  $effect(() => {
    const d = store.current
    if (!map || !d || d.trip.id === fittedTrip) return
    fittedTrip = d.trip.id
    // Frame the places; airports and stations only count when there are no places yet.
    let pts = d.places.map((p) => [p.lat, p.lng] as [number, number])
    if (!pts.length) {
      pts = d.legs.flatMap((l) => (['from', 'to'] as const).map((e) => endpoint(l, e, [])).filter((x) => x !== null))
    }
    if (pts.length) map.fitBounds(pts, { padding: [60, 60], maxZoom: 12, animate: false })
  })

  // Fly to a place when it is opened, if it is off screen.
  $effect(() => {
    const sel = focus.selected
    if (!map || sel?.type !== 'place') return
    const p = untrack(() => store.current?.places.find((x) => x.id === sel.id))
    if (p && !map.getBounds().pad(-0.15).contains([p.lat, p.lng])) {
      map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 9), { duration: 0.6 })
    }
  })
</script>

<svelte:window onclick={(e) => store.layersOpen && layersEl && !layersEl.contains(e.target as Node) && (store.layersOpen = false)} />

<section>
  <div bind:this={el} class="map" class:pinning={pinMode}></div>
  <div class="overlay">
    <TripBar />
    <SearchBox
      viewbox={() => {
        const b = map?.getBounds()
        return b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : null
      }}
      onpick={(r) => {
        map?.flyTo([r.lat, r.lng], 11, { duration: 0.8 })
        if (store.current) store.addPlace(r.lat, r.lng, r.name, r.address)
      }}
    />
    <div class="layers" bind:this={layersEl}>
      <button class="layers-btn" aria-expanded={store.layersOpen} onclick={() => (store.layersOpen = !store.layersOpen)}>Map ▾</button>
      <div class="toggles" class:open={store.layersOpen}>
        <button class:on={pinMode} onclick={() => (pinMode = !pinMode)} title="When on, clicking or tapping the map drops a pin">
          {pinMode ? 'Drop pins: on' : 'Drop pins: off'}
        </button>
        <button class:on={base === 'transit'} onclick={() => (base = base === 'transit' ? 'standard' : 'transit')} title="Show public transport lines">
          Transit
        </button>
        <button class:on={rail} onclick={() => (rail = !rail)} title="Overlay railway lines">Rail</button>
      </div>
    </div>
  </div>
  <button class="expand" onclick={() => (store.mapExpanded = !store.mapExpanded)}>
    {store.mapExpanded ? 'Show plan' : 'Bigger map'}
  </button>
</section>

<style>
  section { position: relative; min-width: 0; height: 100%; }
  .map { position: absolute; inset: 0; }
  .map.pinning { cursor: crosshair; }
  .map.pinning :global(.leaflet-dragging) { cursor: grabbing; }
  .overlay { position: absolute; z-index: 1000; top: 12px; left: 12px; right: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; pointer-events: none; }
  .overlay > :global(*) { pointer-events: auto; }
  .expand { display: none; position: absolute; z-index: 1000; left: 12px; bottom: 24px; background: var(--panel); padding: 6px 10px; }
  .layers { position: relative; }
  .layers-btn { display: none; }
  .toggles { display: flex; gap: 8px; }
  @media (max-width: 820px) {
    .expand { display: block; }
    .overlay { top: 8px; left: 8px; right: 8px; gap: 6px; }
    .overlay button { padding: 6px 8px; }
    /* One "Map" button instead of three, so the top of a short map isn't all buttons. */
    .layers { margin-left: auto; }
    .layers-btn { display: block; }
    .toggles {
      display: none; position: absolute; z-index: 2000; top: calc(100% + 6px); right: 0;
      flex-direction: column; gap: 4px; padding: 4px; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
    }
    .toggles.open { display: flex; }
    .toggles button { text-align: left; white-space: nowrap; }
  }
  .overlay button { background: var(--panel); padding: 8px 10px; color: var(--ink-2); }
  .overlay button.on { color: var(--accent); border-color: var(--accent); }
</style>
