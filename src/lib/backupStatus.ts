/**
 * When did you last back up? Trips live only on this device, so an old or missing backup is worth a nudge. The
 * times are kept in localStorage (a per-browser convenience; losing them only costs a reminder).
 */

const LAST_BACKUP = 'trips:last-backup'
const FIRST_USE = 'trips:first-use'
const DAY = 86_400_000
/** A backup older than this is "due". */
export const DUE_AFTER_DAYS = 14
/** With no backup at all, give people this long before nagging. */
export const GRACE_DAYS = 7

type Keys = Pick<Storage, 'getItem' | 'setItem'>
const local = (): Keys | null => {
  try {
    return localStorage
  } catch {
    return null
  }
}
const read = (s: Keys | null, key: string) => {
  try {
    return Number(s?.getItem(key)) || null
  } catch {
    return null
  }
}
const write = (s: Keys | null, key: string, value: number) => {
  try {
    s?.setItem(key, String(value))
  } catch {}
}

/** Remember when the app was first used with data, so "never backed up" can wait out the grace period. */
export function noteFirstUse(now = Date.now(), s = local()) {
  if (read(s, FIRST_USE) === null) write(s, FIRST_USE, now)
}

export function markBackedUp(now = Date.now(), s = local()) {
  write(s, LAST_BACKUP, now)
}

/** "today", "yesterday", "5 days ago", "3 weeks ago", "4 months ago". */
export function ago(ms: number): string {
  const days = Math.floor(ms / DAY)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}

export interface BackupStatus {
  due: boolean
  label: string
}

export function backupStatus(hasTrips: boolean, now = Date.now(), s = local()): BackupStatus {
  const last = read(s, LAST_BACKUP)
  const first = read(s, FIRST_USE)
  const label = last ? `Last backup ${ago(now - last)}` : 'Never backed up'
  const due = hasTrips && (last ? now - last > DUE_AFTER_DAYS * DAY : first !== null && now - first > GRACE_DAYS * DAY)
  return { due, label }
}
