# Trips

Local trip planner: pin places on an OpenStreetMap map, keep notes, see a calendar of where you'll be and when.

```
npm install
npm run dev     # http://localhost:5173
```

Data lives in `data/trips.db` (SQLite). Back it up by copying that file.
Stack: Svelte 5, TypeScript, Vite, Leaflet, OSM tiles + Nominatim, `node:sqlite` (Node 22.5+).

Map layers: © OpenStreetMap contributors; transit map by [memomaps.de](https://memomaps.de) (ÖPNVKarte); rail overlay by [OpenRailwayMap](https://www.openrailwaymap.org).

Travel legs (flights, trains, …) store local dates and times at each end; no timezone conversion is done.

The layout adapts to phones and tablets: below 820px the map sits above the plan, with a "Bigger map" toggle. Pin dropping starts off ("Drop pins" button on the map) and then remembers your last choice.

Uploaded photos and files are stored in `data/uploads/` (50 MB each). Deleting something hides it for 30 days so it can be undone (toast, or Cmd/Ctrl+Z); after that it is purged on the next server start.
Time zones are looked up offline from coordinates ([tz-lookup](https://github.com/photostructure/tz-lookup)) and can be overridden per leg end.

Hover and selection are handled in one place (`src/lib/focus.svelte.ts`). Hovering a row, pin, line or airport marker lights up everything that stands for it; clicking opens the place or leg (and shows its tab); clicking it again, clicking empty map, or pressing Esc closes it.
