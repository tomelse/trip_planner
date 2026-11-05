<script lang="ts">
  import { onMount } from 'svelte'
  import { loadBlob } from '../lib/files'

  let { id, name }: { id: number; name: string } = $props()

  let url = $state<string | null>(null)

  // The photo lives in the on-device database; give the <img> a temporary URL for it.
  onMount(() => {
    let made: string | undefined
    let gone = false
    loadBlob(id).then((blob) => {
      if (blob && !gone) url = made = URL.createObjectURL(blob)
    })
    return () => {
      gone = true
      if (made) URL.revokeObjectURL(made)
    }
  })
</script>

{#if url}
  <a href={url} target="_blank" rel="noopener" title={name}><img src={url} alt={name} /></a>
{:else}
  <div class="ph" aria-hidden="true"></div>
{/if}

<style>
  img, .ph { display: block; width: 100%; aspect-ratio: 1; border-radius: var(--radius); border: 1px solid var(--line); }
  img { object-fit: cover; }
  .ph { background: var(--hover); }
</style>
