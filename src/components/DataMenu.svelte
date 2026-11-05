<script lang="ts">
  import { store } from '../lib/store.svelte'
  import { buildBackup, download, importBackup, safeName } from '../lib/backup'
  import { markBackedUp } from '../lib/backupStatus'

  let input: HTMLInputElement | undefined = $state()
  let busy = $state(false)
  let message = $state('')
  let persisted = $state<boolean | null>(null)
  let used = $state<number | null>(null)

  // Browsers may clear a site's data under storage pressure unless it is marked persistent.
  $effect(() => {
    navigator.storage?.persisted?.().then((p) => (persisted = p))
    navigator.storage?.estimate?.().then((e) => (used = e.usage ?? null))
  })

  const mb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
  const today = () => new Date().toISOString().slice(0, 10)

  async function run(work: () => Promise<string>) {
    busy = true
    message = ''
    try {
      message = await work()
    } catch (e) {
      message = e instanceof Error ? e.message : String(e)
    }
    busy = false
  }

  const done = (message: string) => {
    markBackedUp()
    store.refreshBackup()
    return message
  }

  const exportTrip = () =>
    run(async () => {
      const t = store.current?.trip
      if (!t) return 'No trip is open.'
      await store.flush()
      download(await buildBackup([t.id]), `${safeName(t.name)}-${today()}.zip`)
      return done('Backup saved.')
    })

  const exportAll = () =>
    run(async () => {
      await store.flush()
      download(await buildBackup(), `trips-${today()}.zip`)
      return done('Backup saved.')
    })

  // Android's share menu: one tap to put the backup in Drive, an email, a chat. Only offered where it can send files.
  const canShare = (() => {
    try {
      return !!navigator.canShare?.({ files: [new File([''], 'x.zip', { type: 'application/zip' })] })
    } catch {
      return false
    }
  })()

  const shareAll = () =>
    run(async () => {
      await store.flush()
      const file = new File([await buildBackup() as BlobPart], `trips-${today()}.zip`, { type: 'application/zip' })
      try {
        await navigator.share({ files: [file], title: 'Trip Planner backup' })
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return '' // you closed the share menu
        throw e
      }
      return done('Backup shared.')
    })

  const pick = () =>
    run(async () => {
      const file = input?.files?.[0]
      if (input) input.value = ''
      if (!file) return ''
      const ids = await importBackup(new Uint8Array(await file.arrayBuffer()))
      await store.afterImport(ids)
      return ids.length === 1 ? 'Imported 1 trip.' : `Imported ${ids.length} trips.`
    })
</script>

<div class="menu">
  <p class="lead">Your trips are stored on this device only. Export a backup now and then, and use it to move trips to another device.</p>
  <div class="btns">
    <button disabled={busy || !store.current} onclick={exportTrip}>Export this trip</button>
    <button disabled={busy || !store.trips.length} onclick={exportAll}>Export all trips</button>
    {#if canShare}<button disabled={busy || !store.trips.length} onclick={shareAll}>Share backup…</button>{/if}
    <button disabled={busy} onclick={() => input?.click()}>Import backup…</button>
    <input bind:this={input} type="file" accept=".zip,application/zip" hidden onchange={pick} />
  </div>
  {#if message}<p class="msg" role="status">{message}</p>{/if}
  <p class="status" class:due={store.backup.due}>{store.backup.label}{store.backup.due ? ': time to back up.' : '.'}</p>
  <p class="status">
    {#if persisted === true}Protected from automatic clean-up.{:else if persisted === false}Not marked as protected. Install the app to your home screen to help keep your data safe.{/if}
    {#if used !== null} {mb(used)} used.{/if}
  </p>
</div>

<style>
  .menu { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius); }
  p { margin: 0; font-size: 12px; color: var(--ink-2); }
  .btns { display: flex; flex-wrap: wrap; gap: 6px; }
  .msg { color: var(--ink); }
  .status { color: var(--ink-3); }
  .status.due { color: var(--warn); }
</style>
