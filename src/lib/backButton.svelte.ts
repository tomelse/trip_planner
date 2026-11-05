import { untrack } from 'svelte'
import { BackStack } from './backStack'
import { store } from './store.svelte'

/**
 * Makes the Back button (Android's, or a browser's) close things instead of leaving the app.
 *
 * Whatever is "open" on top of the base screen is a layer: a dialog, a menu, an item being edited, an open item, the
 * enlarged map, a tab other than Places. Opening a layer adds a history entry; Back closes the topmost layer. With
 * nothing open, Back does what it normally does, which in an installed app is to leave it.
 *
 * Call from a component's setup.
 */
export function useBackButton() {
  const stack = new BackStack(
    () =>
      [
        store.tripDialog && (() => (store.tripDialog = null)),
        store.tripMenuOpen && (() => (store.tripMenuOpen = false)),
        store.layersOpen && (() => (store.layersOpen = false)),
        store.focus.editing && (() => store.focus.stopEdit()),
        store.focus.selected && (() => store.focus.clearSelection()),
        store.mapExpanded && (() => (store.mapExpanded = false)),
        store.tab !== 'places' && (() => (store.tab = 'places')),
      ].filter((close): close is () => void => !!close),
    history,
  )

  // Layers opened or closed by the app (tracked): keep the history the same height.
  $effect(() => {
    store.tripDialog, store.tripMenuOpen, store.layersOpen, store.focus.editing, store.focus.selected, store.mapExpanded, store.tab
    untrack(() => stack.sync())
  })

  $effect(() => {
    const onpop = (e: PopStateEvent) => stack.onPop(e.state)
    window.addEventListener('popstate', onpop)
    return () => window.removeEventListener('popstate', onpop)
  })
}
