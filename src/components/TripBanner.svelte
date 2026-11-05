<script lang="ts">
  import { store } from '../lib/store.svelte'
  import { covers } from '../lib/covers.svelte'
  import { fmtTripDates } from '../lib/dates'
  import PhotoCredit from './PhotoCredit.svelte'

  const trip = $derived(store.current?.trip)
  const places = $derived((store.current?.places ?? []).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng })))

  // Work down the trip's places until one has a photo from its own article to use for the banner.
  $effect(() => {
    void covers.warmBanner(places)
  })

  const banner = $derived(covers.banner(places))
  let url = $state<string | null>(null)
  $effect(() => {
    if (!banner) {
      url = null
      return
    }
    const made = URL.createObjectURL(banner.blob)
    url = made
    return () => URL.revokeObjectURL(made)
  })
</script>

{#if covers.enabled && trip && banner && url}
  <figure>
    <div class="banner">
      <img src={url} alt={banner.photo.kind === 'neighbourhood' ? `The neighbourhood, ${banner.photo.subject}` : banner.photo.subject} />
      <div class="shade"></div>
      <div class="over">
        <p class="name">{trip.name}</p>
        {#if fmtTripDates(trip.start_date, trip.end_date)}<small>{fmtTripDates(trip.start_date, trip.end_date)}</small>{/if}
      </div>
    </div>
    <figcaption><PhotoCredit photo={banner.photo} /></figcaption>
  </figure>
{/if}

<style>
  figure { margin: 0 0 12px; display: flex; flex-direction: column; gap: 6px; }
  figcaption { padding: 0 12px; }
  .banner { position: relative; height: 120px; background: var(--hover); overflow: hidden; }
  /* A little above centre: faces and the tops of landmarks sit in the upper part of a portrait photo. */
  img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; }
  .shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.05)); pointer-events: none; }
  .over { position: absolute; left: 14px; right: 14px; bottom: 10px; color: #fff; pointer-events: none; }
  .over p { margin: 0; }
  .name { font-size: 18px; font-weight: 600; overflow-wrap: anywhere; }
  .over small { display: block; font-size: 11px; opacity: 0.88; }
</style>
