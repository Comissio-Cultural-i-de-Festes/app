import { registerSW } from 'virtual:pwa-register'

const UPDATE_INTERVAL_MS = 60 * 60 * 1000

/**
 * Fired when the tab comes back to the foreground, when the network returns,
 * and once an hour.
 *
 * The service worker is only half of the staleness problem. "Someone with the
 * app open since yesterday" is stale React state, not a stale cache — the
 * worker never re-enters the picture. Screens that show reveal-gated content
 * subscribe here and refetch, so the countdown does not require closing and
 * reopening the app.
 */
export const appRevalidate = new EventTarget()
export const APP_REVALIDATE = 'app:revalidate'

export function setupPwa(): void {
  const emit = (): void => {
    appRevalidate.dispatchEvent(new Event(APP_REVALIDATE))
  }

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return

      const check = (): void => {
        if (navigator.onLine) void registration.update()
      }

      setInterval(check, UPDATE_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          check()
          emit()
        }
      })
      window.addEventListener('online', emit)
    },
  })
}
