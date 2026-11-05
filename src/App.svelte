<script lang="ts">
  import { onMount } from 'svelte'
  import Sidebar from './components/Sidebar.svelte'
  import MapView from './components/MapView.svelte'
  import Toast from './components/Toast.svelte'
  import TripDialog from './components/TripDialog.svelte'
  import { store } from './lib/store.svelte'
  import { useBackButton } from './lib/backButton.svelte'
  import { clearLaunch, readLaunch } from './lib/launch'
  import SharedPlaceDialog from './components/SharedPlaceDialog.svelte'

  onMount(() => {
    store.init().then(() => {
      // Opened from an icon shortcut, or with a place shared into the app.
      const launch = readLaunch()
      if (!launch) return
      clearLaunch()
      if (launch.kind === 'new-trip') store.tripDialog = 'new'
      else if (launch.kind === 'share') store.shared = launch.shared
      else {
        if (launch.agenda) {
          try {
            localStorage.setItem('trips:calendar-view', 'agenda')
          } catch {}
        }
        store.tab = launch.tab
      }
    })
  })
  useBackButton()

  // Only the panels inside the page scroll. If anything ever shifts the page itself (there is no scrollbar to undo
  // it), put it straight back so the map and the trip menu can't end up out of reach.
  $effect(() => {
    const reset = () => {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
    }
    window.addEventListener('scroll', reset, { passive: true })
    return () => window.removeEventListener('scroll', reset)
  })

  const typing = (el: HTMLElement | null) =>
    !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

  function onkeydown(e: KeyboardEvent) {
    // A dialog handles its own keys (Esc cancels it); don't also close what is open behind it.
    if (document.querySelector('dialog[open]')) return
    if (typing(e.target as HTMLElement | null)) return
    // Cmd/Ctrl+Z undoes the last delete (in a text field it keeps undoing text instead).
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && store.toast?.undo && store.toast.label === 'Undo') {
      e.preventDefault()
      store.undo()
    }
    // Escape closes whatever place or leg is open.
    if (e.key === 'Escape') store.focus.clearSelection()
  }
</script>

<svelte:window {onkeydown} />

<main class:expanded={store.mapExpanded}>
  <Sidebar />
  <MapView />
</main>
<TripDialog />
<SharedPlaceDialog />
<Toast />

<style>
  main {
    display: grid;
    grid-template-columns: clamp(300px, 34vw, 360px) 1fr;
    height: 100%;
    height: 100dvh;
  }

  /* Phones and small tablets: map on top, plan below. */
  @media (max-width: 820px) {
    main {
      grid-template-columns: 1fr;
      grid-template-rows: 42dvh 1fr;
    }
    main.expanded { grid-template-rows: 1fr 30dvh; }
    main :global(aside) { order: 2; border-right: none; border-top: 1px solid var(--line); }
  }
</style>
