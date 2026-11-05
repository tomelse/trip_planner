<script lang="ts">
  import { store } from '../lib/store.svelte'

  let { placeId, legId }: { placeId?: number; legId?: number } = $props()

  // Same set the server will show inline; anything else (including SVG) downloads.
  const IMAGES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']

  const files = $derived(
    (store.current?.attachments ?? []).filter((a) =>
      placeId ? a.place_id === placeId : legId ? a.leg_id === legId : a.place_id === null && a.leg_id === null,
    ),
  )

  let input: HTMLInputElement | undefined = $state()
  let busy = $state(false)
  let dropping = $state(false)

  async function add(list: File[]) {
    if (!list.length) return
    busy = true
    await store.uploadFiles(list, { placeId, legId })
    busy = false
  }

  const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
</script>

<div
  class="files"
  class:dropping
  role="group"
  aria-label="Attachments"
  ondragover={(e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    dropping = true
  }}
  ondragleave={() => (dropping = false)}
  ondrop={(e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    dropping = false
    add([...(e.dataTransfer?.files ?? [])])
  }}
>
  <div class="head">
    <span>Photos &amp; files</span>
    <button class="ghost" disabled={busy} onclick={() => input?.click()}>{busy ? 'Uploading…' : '+ Add'}</button>
    <input bind:this={input} type="file" multiple hidden onchange={() => { add([...(input?.files ?? [])]); if (input) input.value = '' }} />
  </div>
  {#if files.length}
    <div class="grid">
      {#each files as f (f.id)}
        <div class="file">
          {#if IMAGES.includes(f.mime)}
            <a href="/api/files/{f.id}" target="_blank" rel="noopener" title={f.name}>
              <img src="/api/files/{f.id}" alt={f.name} loading="lazy" />
            </a>
          {:else}
            <a class="doc" href="/api/files/{f.id}" download={f.name} title={f.name}>
              <strong>{f.name}</strong>
              <small>{size(f.size)}</small>
            </a>
          {/if}
          <button class="x" onclick={() => store.deleteAttachment(f.id)} aria-label="Remove {f.name}" title="Remove">×</button>
        </div>
      {/each}
    </div>
  {:else}
    <p>Drop files here, or add photos, tickets and PDFs.</p>
  {/if}
</div>

<style>
  .files { border: 1px dashed transparent; border-radius: var(--radius); }
  .files.dropping { border-color: var(--accent); background: var(--accent-soft); }
  .head { display: flex; justify-content: space-between; align-items: center; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-3); }
  .head button { padding: 0 6px; min-height: 0; font-size: 12px; text-transform: none; letter-spacing: 0; }
  p { margin: 2px 0 0; font-size: 12px; color: var(--ink-3); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 6px; margin-top: 4px; }
  .file { position: relative; }
  img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--radius); border: 1px solid var(--line); }
  .doc { display: flex; flex-direction: column; justify-content: center; gap: 2px; aspect-ratio: 1; padding: 6px; border: 1px solid var(--line); border-radius: var(--radius); color: inherit; text-decoration: none; overflow: hidden; }
  .doc strong { font-size: 11px; font-weight: 500; word-break: break-all; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .doc small { color: var(--ink-3); font-size: 11px; }
  .x { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; padding: 0; min-height: 0; line-height: 1; border-radius: 50%; background: var(--panel); font-size: 14px; }
</style>
