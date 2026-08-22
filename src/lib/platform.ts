/**
 * Which iOS context are we in?
 *
 * This matters more than it looks. A web app added to the iPhone home screen
 * gets its own storage jar, separate from Safari's: a session signed in on one
 * side does not exist on the other. Every decision in the install and entry
 * flows follows from that.
 */

/**
 * iOS, including iPadOS, which reports itself as a Mac. The touch-point test
 * is the standard way to tell an iPad from a desktop Safari.
 */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return ua.includes('Macintosh') && navigator.maxTouchPoints > 1
}

/** Running from the home-screen icon rather than inside Safari. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // `navigator.standalone` is the iOS-only signal and predates the media
  // query; the media query is what everything else uses. Check both.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}
