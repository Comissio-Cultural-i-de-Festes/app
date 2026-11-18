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

/**
 * The browser an app opens inside itself when somebody taps a link in it.
 *
 * Instagram and Facebook are where the invitation travels, along with
 * WhatsApp, and their in-app browsers break the door: Google refuses OAuth in
 * an embedded webview (`disallowed_useragent`, a 403 on Android), and on iOS
 * the home-screen steps describe a Safari that is not there. Neither says why.
 * So the door has to know, and say "open this in your browser" instead.
 *
 * Matched on the markers each app puts in its user agent, not on the engine:
 * an iPhone home-screen app also has no `Safari/` token, so "WebKit without
 * Safari" would lock out exactly the people who did everything right. The one
 * engine-level rule is Android's `; wv)`, which stock Chrome never sends.
 * WhatsApp is not on the list because it hands links to the system browser.
 */
export type InAppBrowser =
  'instagram' | 'messenger' | 'facebook' | 'tiktok' | 'snapchat' | 'linkedin' | 'webview'

// Order matters: Messenger carries the Facebook markers too, and every
// Android one also carries `; wv)`, so the specific name wins over the generic.
const IN_APP_MARKERS: readonly (readonly [InAppBrowser, RegExp])[] = [
  ['instagram', /\bInstagram\b/],
  ['messenger', /FBAN\/Messenger|FB_IAB\/Orca/],
  ['facebook', /FBAN\/|FBAV\/|FB_IAB\//],
  ['tiktok', /musical_ly|BytedanceWebview|TikTok/i],
  ['snapchat', /\bSnapchat\b/],
  ['linkedin', /LinkedInApp/],
  ['webview', /Android[^)]*; wv\)/],
]

export function detectInAppBrowser(ua: string): InAppBrowser | null {
  for (const [kind, marker] of IN_APP_MARKERS) {
    if (marker.test(ua)) return kind
  }
  return null
}

export function inAppBrowser(): InAppBrowser | null {
  if (typeof navigator === 'undefined') return null
  return detectInAppBrowser(navigator.userAgent)
}

export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Android')
}

/**
 * A link that asks Android to open this very page in Chrome.
 *
 * The whole URL goes through, query included: the invitation code lives in it.
 * `S.browser_fallback_url` is what runs if Chrome is not installed, so the
 * worst case is the same page in the same place, not a dead tap. The fragment
 * is dropped because `#Intent` would end the URL there; nothing in this app
 * reads one.
 */
export function androidChromeIntent(url: string): string {
  const { protocol, host, pathname, search } = new URL(url)
  const scheme = protocol.replace(':', '')
  return (
    `intent://${host}${pathname}${search}#Intent;scheme=${scheme};` +
    `package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`
  )
}
