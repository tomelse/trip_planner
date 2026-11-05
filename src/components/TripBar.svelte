<script lang="ts">
  import { store } from '../lib/store.svelte'
  import { fmtTripDates } from '../lib/dates'
  import { covers } from '../lib/covers.svelte'
  import DataMenu from './DataMenu.svelte'

  let root: HTMLDivElement | undefined = $state()
  let showData = $state(false)
  const open = $derived(store.tripMenuOpen)

  // The backup panel folds away whenever the menu does, however it was closed (including Back).
  $effect(() => {
    if (!store.tripMenuOpen) showData = false
  })

  const trip = $derived(store.current?.trip)
  const dates = $derived(trip ? fmtTripDates(trip.start_date, trip.end_date) : '')

  function close() {
    store.tripMenuOpen = false
  }

  function choose(id: number) {
    close()
    if (id !== trip?.id) store.openTrip(id)
  }

  function openDialog(mode: 'new' | 'edit') {
    close()
    store.tripDialog = mode
  }
</script>

<svelte:window onclick={(e) => open && root && !root.contains(e.target as Node) && close()} />

<div
  class="bar"
  bind:this={root}
  role="presentation"
  onkeydown={(e) => {
    // Esc closes the menu without also closing whatever is open in the sidebar.
    if (e.key === 'Escape' && open) {
      e.stopPropagation()
      close()
    }
  }}
>
  <button class="chip" aria-haspopup="menu" aria-expanded={open} onclick={() => (store.tripMenuOpen = !store.tripMenuOpen)}>
    <span class="text">
      <span class="name">{trip?.name ?? 'No trips yet'}</span>
      {#if dates}<small>{dates}</small>{/if}
    </span>
    {#if store.backup.due}<span class="dot" role="img" aria-label="Time to back up your trips" title="Time to back up your trips"></span>{/if}
    <span class="chev" aria-hidden="true">▾</span>
  </button>

  {#if open}
    <div class="panel" role="menu">
      {#if store.backup.due && !showData}
        <button class="nudge" role="menuitem" onclick={() => (showData = true)}>
          <strong>Back up your trips</strong>
          <small>{store.backup.label}. They are only stored on this device.</small>
        </button>
      {/if}
      {#if store.trips.length}
        <ul>
          {#each store.trips as t (t.id)}
            <li>
              <button role="menuitemradio" aria-checked={t.id === trip?.id} class:cur={t.id === trip?.id} onclick={() => choose(t.id)}>
                <span class="n">{t.name}</span>
                {#if fmtTripDates(t.start_date, t.end_date)}<small>{fmtTripDates(t.start_date, t.end_date)}</small>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="actions">
        <button role="menuitem" onclick={() => openDialog('new')}>New trip…</button>
        {#if trip}<button role="menuitem" onclick={() => openDialog('edit')}>Trip details…</button>{/if}
        <button role="menuitem" aria-expanded={showData} onclick={() => (showData = !showData)}>Backup &amp; import…</button>
        <button role="menuitemcheckbox" aria-checked={covers.enabled} onclick={() => covers.setEnabled(!covers.enabled)}>
          Place photos: {covers.enabled ? 'on' : 'off'}
          <small>Looked up on Wikipedia and Wikimedia from each place's name and position, once, and kept on this device.</small>
        </button>
      </div>
      {#if showData}<div class="data"><DataMenu /></div>{/if}
    </div>
  {/if}
</div>

<style>
  .bar { position: relative; min-width: 0; max-width: 100%; }
  .chip { display: flex; align-items: center; gap: 8px; max-width: 100%; background: var(--panel); text-align: left; padding: 5px 10px; }
  .text { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
  .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .text small { color: var(--ink-2); font-size: 11px; white-space: nowrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--warn); flex: none; }
  .nudge { display: flex; flex-direction: column; align-items: flex-start; width: 100%; border: none; text-align: left; gap: 1px; margin-bottom: 4px; background: var(--hover); }
  .nudge small { color: var(--ink-2); font-size: 11px; }
  .chev { color: var(--ink-3); flex: none; }
  .panel {
    position: absolute; z-index: 2000; top: calc(100% + 6px); left: 0;
    width: min(320px, calc(100vw - 24px)); max-height: 70dvh; overflow-y: auto;
    background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 4px;
  }
  ul { list-style: none; margin: 0; padding: 0 0 4px; border-bottom: 1px solid var(--line); }
  li button, .actions button { display: flex; flex-direction: column; align-items: flex-start; width: 100%; border: none; text-align: left; gap: 1px; }
  li button.cur { background: var(--hover); }
  .n { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li small, .actions small { color: var(--ink-3); font-size: 11px; }
  .actions { padding-top: 4px; }
  .data { padding: 4px; }
</style>
