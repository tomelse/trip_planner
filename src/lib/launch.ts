import { parseShared, type Shared } from './share'

/** What the app was opened for: a long-press shortcut on the icon, or a place shared into it. */
export type Launch =
  | { kind: 'new-trip' }
  | { kind: 'tab'; tab: 'calendar' | 'travel'; agenda?: boolean }
  | { kind: 'share'; shared: Shared }

export function readLaunch(search = location.search): Launch | null {
  const q = new URLSearchParams(search)
  const title = q.get('title')
  const text = q.get('text')
  const url = q.get('url')
  if (title || text || url) {
    const shared = parseShared({ title, text, url })
    return shared.name || shared.coords ? { kind: 'share', shared } : null
  }
  switch (q.get('action')) {
    case 'new-trip':
      return { kind: 'new-trip' }
    case 'itinerary':
      return { kind: 'tab', tab: 'calendar', agenda: true }
    case 'travel':
      return { kind: 'tab', tab: 'travel' }
    default:
      return null
  }
}

/** Drop the launch parameters from the address so a reload doesn't repeat the action. Keeps the history state. */
export function clearLaunch() {
  history.replaceState(history.state, '', location.pathname + location.hash)
}
