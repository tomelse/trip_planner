import { iso } from './dates'

/** Today's date on the device's calendar, kept current if the app stays open past midnight. */
export const clock = $state({ today: iso(new Date()) })

export function refreshClock(now = new Date()) {
  const today = iso(now)
  if (today !== clock.today) clock.today = today
}

if (typeof document !== 'undefined') {
  setInterval(() => refreshClock(), 60_000)
  // A phone may have been asleep for hours; check as soon as the app is looked at again.
  document.addEventListener('visibilitychange', () => refreshClock())
}
