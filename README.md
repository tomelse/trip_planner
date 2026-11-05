# Trips

Plan trips: pin places on an OpenStreetMap map, track flights and other travel (with times in local time at each end), keep notes and checklists, attach photos and files, and see it all in a calendar or itinerary. It runs entirely in the browser; **your trips are stored on your device** (IndexedDB) and never sent anywhere.

```
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

Stack: Svelte 5, TypeScript, Vite, Leaflet, OSM tiles + Nominatim, IndexedDB (`idb`), `vite-plugin-pwa`.

## Using it on a phone

It is an installable web app. Publish it, open the address in Chrome on Android, then use the menu → **Install app** (or **Add to Home screen**). After the first load it works offline, including map areas you have already looked at.

Publishing to GitHub Pages: push the project to a GitHub repository, then in **Settings → Pages** set the source to **GitHub Actions**. The workflow in `.github/workflows/deploy.yml` builds and deploys on every push to `main`. Only the app's code is published, never your trips.

## Your data

- Data lives in the browser's storage for each address, so `localhost`, the Pages site and each device are separate. Use the trip menu at the top of the map (the trip name) → **Backup & import…** to move trips between them. Importing always adds new trips; it never overwrites.
- A backup is a `.zip` with the trips as JSON and the attached files. Export now and then: clearing a browser's site data deletes the trips.
- Deleting something hides it for 30 days so it can be undone (the toast, or Cmd/Ctrl+Z). After that it is purged on the next start.
- Time zones are looked up offline from coordinates ([tz-lookup](https://github.com/photostructure/tz-lookup)) and can be overridden per leg end.
- Files can be up to 50 MB each. Only plain images are ever shown in the app; everything else downloads.

### Coming from the old server version

Earlier versions kept data in `data/trips.db` behind a small server. To bring it over, run `npm run export-legacy` (read-only; writes `data/legacy-export.zip`), then **Import backup…** in the app. `data/` is git-ignored. You can delete `scripts/export-legacy.ts` afterwards.

## Interaction

Hover and selection are handled in one place (`src/lib/focus.svelte.ts`). Hovering a row, pin, line or airport marker lights up everything that stands for it (and the things linked to it); clicking opens the place or leg and shows its tab; clicking it again, clicking empty map, or pressing Esc closes it. The trip menu at the top of the map switches trips and opens New trip / Trip details; deleting a trip is only offered inside Trip details, and asks you to type the trip's name when it has content. Pin dropping starts off ("Drop pins" on the map) and then remembers your last choice. Below 820px the map sits above the plan, with a "Bigger map" toggle.

Map data © OpenStreetMap contributors; transit map by [memomaps.de](https://memomaps.de) (ÖPNVKarte); rail overlay by [OpenRailwayMap](https://www.openrailwaymap.org).
