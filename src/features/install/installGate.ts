import { isIos, isStandalone } from '@/lib/platform'

/**
 * When to show the install screen.
 *
 * The brief calls this the screen with the most effect on whether people end
 * up with the app at all, so it appears before signing in rather than after:
 * on iOS the home-screen app has its own storage, and telling somebody to
 * install after they have signed in means they tap the icon and find
 * themselves signed out.
 *
 * It is not a wall. Skipping it continues in Safari, with a one-line warning
 * that signing in again from the icon will be necessary. Blocking the door at
 * the October meeting would be worse than the problem it solves.
 */

const SNOOZE_KEY = 'comi.install.snoozedUntil'

const DAY_MS = 24 * 60 * 60 * 1000
/** "Not now" — long enough not to nag, short enough to catch them before the
 *  first event. */
export const SNOOZE_LATER_MS = 7 * DAY_MS
/** "Already done" — we cannot verify it from Safari, so take their word for a
 *  while. If it is true, the icon is standalone and never asks again anyway. */
export const SNOOZE_DONE_MS = 30 * DAY_MS

function readSnooze(): number {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY)
    const until = raw === null ? 0 : Number(raw)
    return Number.isFinite(until) ? until : 0
  } catch {
    // Private mode, or storage blocked. Not a reason to hide the screen.
    return 0
  }
}

export function snoozeInstall(forMs: number, now = Date.now()): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(now + forMs))
  } catch {
    // Nothing to do: the screen will simply come back next time.
  }
}

export function clearInstallSnooze(): void {
  try {
    localStorage.removeItem(SNOOZE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Android and desktop are excluded: they have their own install affordances,
 * and the two mock-ups on this screen are of Safari specifically.
 */
export function shouldPromptInstall(now = Date.now()): boolean {
  if (!isIos()) return false
  if (isStandalone()) return false
  return now >= readSnooze()
}
