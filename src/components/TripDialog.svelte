<script lang="ts">
  import { store } from '../lib/store.svelte'

  let dlg: HTMLDialogElement | undefined = $state()
  let nameInput: HTMLInputElement | undefined = $state()
  let name = $state('')
  let start = $state('')
  let end = $state('')
  let confirming = $state(false)
  let typed = $state('')
  let busy = $state(false)

  const mode = $derived(store.tripDialog)
  const trip = $derived(store.current?.trip)
  const valid = $derived(name.trim().length > 0 && !(start && end && end < start))

  // Open and close the native modal as the store asks, filling the form from the trip being edited.
  $effect(() => {
    if (!dlg) return
    if (mode && !dlg.open) {
      const t = mode === 'edit' ? store.current?.trip : undefined
      name = t?.name ?? ''
      start = t?.start_date ?? ''
      end = t?.end_date ?? ''
      confirming = false
      typed = ''
      dlg.showModal()
      if (mode === 'new') nameInput?.focus()
    } else if (!mode && dlg.open) dlg.close()
  })

  // What deleting would hide, so the confirmation can say what is at stake.
  const contents = $derived.by(() => {
    const d = store.current
    if (!d) return []
    const n = (count: number, one: string, many: string) => (count ? [`${count} ${count === 1 ? one : many}`] : [])
    return [
      ...n(d.places.length, 'place', 'places'),
      ...n(d.legs.length, 'travel leg', 'travel legs'),
      ...n(d.notes.length, 'note', 'notes'),
      ...n(d.items.length, 'checklist item', 'checklist items'),
      ...n(d.attachments.length, 'file', 'files'),
    ]
  })
  const nameMatches = $derived(typed.trim().toLowerCase() === (trip?.name ?? '').trim().toLowerCase())
  const canDelete = $derived(contents.length === 0 || nameMatches)

  async function save(e: SubmitEvent) {
    e.preventDefault()
    if (!valid || busy) return
    busy = true
    try {
      if (mode === 'new') await store.createTrip(name, start || null, end || null)
      else {
        store.patchTrip({ name: name.trim(), start_date: start || null, end_date: end || null })
        await store.flush()
      }
      store.tripDialog = null
    } finally {
      busy = false
    }
  }

  async function remove() {
    if (!canDelete || busy) return
    busy = true
    try {
      await store.deleteTrip()
      store.tripDialog = null
    } finally {
      busy = false
    }
  }
</script>

<dialog bind:this={dlg} onclose={() => (store.tripDialog = null)} aria-labelledby="trip-dialog-title">
  <form class="content" onsubmit={save}>
    <h2 id="trip-dialog-title">{mode === 'new' ? 'New trip' : 'Trip details'}</h2>

    <label class="field">Name
      <input bind:this={nameInput} bind:value={name} placeholder="e.g. Japan 2027" required />
    </label>
    <div class="dates">
      <label class="field">From
        <input type="date" bind:value={start} />
      </label>
      <label class="field">To
        <input type="date" min={start || undefined} bind:value={end} />
      </label>
    </div>
    {#if start && end && end < start}<p class="err">The end date is before the start date.</p>{/if}

    <div class="buttons">
      <button type="button" onclick={() => (store.tripDialog = null)}>Cancel</button>
      <button class="primary" disabled={!valid || busy}>{mode === 'new' ? 'Create trip' : 'Save'}</button>
    </div>

    {#if mode === 'edit' && trip}
      <section class="danger">
        <h3>Danger zone</h3>
        {#if !confirming}
          <button type="button" class="ghost danger" onclick={() => (confirming = true)}>Delete this trip…</button>
        {:else}
          <p>
            This removes <strong>{trip.name}</strong>{#if contents.length} and everything in it ({contents.join(', ')}){/if}. You can undo for 30 days.
          </p>
          {#if contents.length}
            <label class="field">Type the trip name to confirm
              <input bind:value={typed} autocomplete="off" autocapitalize="off" spellcheck="false" placeholder={trip.name} />
            </label>
          {/if}
          <div class="buttons">
            <button type="button" onclick={() => (confirming = false)}>Keep trip</button>
            <button type="button" class="primary warn" disabled={!canDelete || busy} onclick={remove}>Delete trip</button>
          </div>
        {/if}
      </section>
    {/if}
  </form>
</dialog>

<style>
  dialog {
    width: min(420px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow-y: auto;
    padding: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); color: var(--ink);
  }
  dialog::backdrop { background: rgba(0, 0, 0, 0.4); }
  .content { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  h2 { margin: 0; font-size: 16px; }
  h3 { margin: 0; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--danger); }
  .dates { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .buttons { display: flex; justify-content: flex-end; gap: 8px; }
  .err { margin: 0; font-size: 12px; color: var(--danger); }
  .danger { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; margin-top: 4px; padding-top: 12px; border-top: 1px solid var(--line); }
  .danger p { margin: 0; font-size: 13px; color: var(--ink-2); }
  .danger .field, .danger .buttons { align-self: stretch; }
  .primary.warn { background: var(--danger); border-color: var(--danger); color: #fff; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
