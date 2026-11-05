<script lang="ts">
  import type { CoverState } from '../lib/covers.svelte'

  /** The credit a free licence asks for: who took it, under what licence, and where to see the original. */
  let { photo }: { photo: (CoverState & { status: 'ready' })['photo'] } = $props()

  const c = $derived(photo.credit)
  const short = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
</script>

<span class="credit">
  {photo.kind === 'neighbourhood' ? `Photo of the neighbourhood, ${photo.subject}. ` : ''}Photo: {short(c.author)} ·
  <a href={c.licenseUrl ?? c.pageUrl} target="_blank" rel="noopener">{c.license}</a> ·
  <a href={c.pageUrl} target="_blank" rel="noopener">{c.from}</a>
</span>

<style>
  .credit { font-size: 11px; color: var(--ink-2); overflow-wrap: anywhere; }
  a { color: var(--accent); }
</style>
