<script lang="ts">
  import { covers } from '../lib/covers.svelte'
  import { categoryLabel } from '../lib/categories'
  import type { Place } from '../lib/types'
  import PhotoCredit from './PhotoCredit.svelte'

  let { place }: { place: Place } = $props()

  // Look the photo up when the place is shown; a new name or position (or switching photos on) runs this again.
  $effect(() => {
    void covers.ensure({ id: place.id, name: place.name, lat: place.lat, lng: place.lng })
  })

  const cover = $derived(covers.state(place.id))
  let url = $state<string | null>(null)
  // The photo is kept in the database as a Blob; give the <img> a temporary URL for it.
  $effect(() => {
    if (cover?.status !== 'ready') {
      url = null
      return
    }
    const made = URL.createObjectURL(cover.blob)
    url = made
    return () => URL.revokeObjectURL(made)
  })
</script>

{#if covers.enabled}
  {#if cover?.status === 'loading'}
    <div class="hero wait" aria-hidden="true"></div>
  {:else if cover?.status === 'ready' && url}
    <figure>
      <div class="hero">
        <img src={url} alt={cover.photo.kind === 'neighbourhood' ? `The neighbourhood, ${cover.photo.subject}` : cover.photo.subject} />
        <div class="shade"></div>
        <div class="over">
          {#if place.category}<p class="chip">{categoryLabel(place.category)}</p>{/if}
          <p class="name">{place.name}</p>
        </div>
      </div>
      <figcaption><PhotoCredit photo={cover.photo} /></figcaption>
    </figure>
  {/if}
{/if}

<style>
  figure { margin: 0 -12px; display: flex; flex-direction: column; gap: 6px; }
  figcaption { padding: 0 12px; }
  .hero { position: relative; aspect-ratio: 16 / 9; background: var(--hover); overflow: hidden; margin: 0 -12px; }
  figure .hero { margin: 0; }
  .wait { margin: 0 -12px; animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.55; } }
  @media (prefers-reduced-motion: reduce) { .wait { animation: none; } }
  /* A little above centre: faces and the tops of landmarks sit in the upper part of a portrait photo. */
  img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; }
  .shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0, 0, 0, 0.62), rgba(0, 0, 0, 0) 62%); pointer-events: none; }
  .over { position: absolute; left: 14px; right: 14px; bottom: 10px; color: #fff; pointer-events: none; }
  .over p { margin: 0; }
  .chip { font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(255, 255, 255, 0.8); }
  .name { font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
</style>
