<script lang="ts">
  import { untrack } from 'svelte'
  import { store, type Tab } from '../lib/store.svelte'
  import IssuesBanner from './IssuesBanner.svelte'
  import PlaceList from './PlaceList.svelte'
  import TravelList from './TravelList.svelte'
  import CalendarView from './CalendarView.svelte'
  import NotesPanel from './NotesPanel.svelte'

  // A highlight that came from a list must not outlive that list when you switch tabs.
  // Untracked: clearListHover reads the hover itself, and we only want to react to the tab changing.
  $effect(() => {
    void store.tab
    untrack(() => store.focus.clearListHover())
  })

  const tabs: { id: Tab; label: string }[] = [
    { id: 'places', label: 'Places' },
    { id: 'travel', label: 'Travel' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'notes', label: 'Notes' },
  ]
</script>

<aside>
  {#if store.error}
    <p class="error">{store.error}</p>
  {/if}
  {#if store.current}
    <IssuesBanner />
    <nav>
      {#each tabs as t}
        <button class:active={store.tab === t.id} onclick={() => (store.tab = t.id)}>
          {t.label}
          {#if t.id === 'places'}<span>{store.current.places.length}</span>{/if}
          {#if t.id === 'travel'}<span>{store.current.legs.length}</span>{/if}
          {#if t.id === 'notes'}<span>{store.current.notes.length}</span>{/if}
        </button>
      {/each}
    </nav>
    <div class="body">
      {#if store.tab === 'places'}<PlaceList />{/if}
      {#if store.tab === 'travel'}<TravelList />{/if}
      {#if store.tab === 'calendar'}<CalendarView />{/if}
      {#if store.tab === 'notes'}<NotesPanel />{/if}
    </div>
  {:else if !store.error}
    <div class="empty">
      <p>No trip open.</p>
      <button class="primary" onclick={() => (store.tripDialog = 'new')}>Create your first trip</button>
      <p class="hint">Or use the trip menu on the map to import a backup.</p>
    </div>
  {/if}
</aside>

<style>
  aside {
    display: flex; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden;
    background: var(--panel); border-right: 1px solid var(--line);
  }
  nav { height: var(--nav-h); box-sizing: border-box; display: flex; gap: 0; padding: 0 12px; border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: none; flex: none; }
  nav button {
    border: none; border-radius: 0; padding: 10px 8px; color: var(--ink-2);
    border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; min-height: 0;
  }
  nav button:hover { background: none; color: var(--ink); }
  nav button.active { color: var(--ink); border-bottom-color: var(--ink); }
  nav span { margin-left: 4px; font-size: 11px; color: var(--ink-3); }
  .body { flex: 1; overflow-y: auto; min-height: 0; padding-bottom: env(safe-area-inset-bottom); }
  /* Short screens: let the whole panel scroll so the trip header doesn't eat the list. */
  @media (max-width: 820px) {
    aside { overflow-y: auto; }
    .body { overflow: visible; flex: none; }
    nav { position: sticky; top: 0; z-index: 3; background: var(--panel); }
    /* The whole panel scrolls here, so the tab bar is stuck at the top; anything else that sticks goes under it. */
    .body { --sticky-top: var(--nav-h); }
  }
  .empty, .error { padding: 16px; color: var(--ink-2); margin: 0; }
  .empty { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
  .empty p { margin: 0; }
  .hint { font-size: 12px; color: var(--ink-3); }
  .error { color: var(--danger); }
</style>
