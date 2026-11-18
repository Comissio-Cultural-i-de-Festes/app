import { describe, expect, it } from 'vitest'

import { androidChromeIntent, detectInAppBrowser } from './platform'

/**
 * Representative strings in the formats each app documents or is known to
 * send. The shapes (the `Instagram NNN` token, the `FBAN/FBAV` bracket, the
 * `FB_IAB` marker, the `; wv)` of an Android WebView) are what the detector
 * keys on; device models, build numbers and versions are made up, because
 * the detector must not depend on them. Sources: the Android WebView user
 * agent guide on developer.chrome.com, the Facebook in-app browser strings
 * published in the user-agents catalogues (useragents.io, WhatIsMyBrowser),
 * and Google's `disallowed_useragent` policy page for why a webview is
 * refused. Re-check them against a real phone when a new app is added.
 */
const IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const DROID = 'Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007'
const WV =
  'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36'

const INSIDE: readonly [string, string, string][] = [
  [
    'Instagram iOS',
    `${IOS} Mobile/21F90 Instagram 345.0.0.34.108 (iPhone14,5; iOS 17_5; en_US; en-US; scale=3.00; 1170x2532; 636882630)`,
    'instagram',
  ],
  [
    'Instagram Android',
    `${DROID}; wv) ${WV} Instagram 345.0.0.36.111 Android (34/14; 480dpi; 1080x2340; samsung; SM-S911B; dm1q; qcom; en_US; 636882600)`,
    'instagram',
  ],
  [
    'Facebook iOS',
    `${IOS} Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.38.108;FBBV/567890123;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/ca_ES;FBOP/5;FBRV/0]`,
    'facebook',
  ],
  ['Facebook Android', `${DROID}; wv) ${WV} [FB_IAB/FB4A;FBAV/460.0.0.45.108;]`, 'facebook'],
  [
    'Facebook Android (FBAN)',
    `${DROID}; wv) ${WV} [FBAN/EMA;FBLC/es_ES;FBAV/430.0.0.31.108;]`,
    'facebook',
  ],
  [
    'Messenger iOS',
    `${IOS} Mobile/15E148 [FBAN/MessengerForiOS;FBAV/445.0.0.30.108;FBBV/543210987;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]`,
    'messenger',
  ],
  [
    'Messenger Android',
    `${DROID}; wv) ${WV} [FB_IAB/Orca-Android;FBAV/455.0.0.40.108;]`,
    'messenger',
  ],
  [
    'TikTok Android',
    `${DROID}; wv) ${WV} BytedanceWebview/d8a21c6 musical_ly_2023405030 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/34.5.3`,
    'tiktok',
  ],
  [
    'Snapchat iOS',
    `${IOS} Mobile/15E148 Snapchat/12.80.0.34 (like Safari/8618.1.15.10.15, iPhone14,5; iOS 17.5; gzip)`,
    'snapchat',
  ],
  ['LinkedIn iOS', `${IOS} Mobile/15E148 [LinkedInApp]/9.30.1521`, 'linkedin'],
  [
    'Threads iOS',
    `${IOS} Mobile/15E148 Barcelona 330.0.0.35.108 (iPhone14,5; iOS 17_5; en_US; en-US; scale=3.00; 1170x2532; 600000000)`,
    'threads',
  ],
  ['Android WebView of an app not on the list', `${DROID}; wv) ${WV}`, 'webview'],
]

const OUTSIDE: readonly [string, string][] = [
  ['Safari iOS', `${IOS} Version/17.5 Mobile/15E148 Safari/604.1`],
  [
    'Chrome Android',
    `${DROID}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36`,
  ],
  ['Chrome iOS', `${IOS} CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1`],
  ['Firefox iOS', `${IOS} FxiOS/127.0 Mobile/15E148 Safari/605.1.15`],
  ['Firefox Android', 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0'],
  [
    'Samsung Internet',
    `${DROID}) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36`,
  ],
  ['iOS home-screen app (no Safari token at all)', `${IOS} Mobile/15E148`],
  [
    'Desktop Chrome',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  ],
]

describe('detectInAppBrowser', () => {
  it.each(INSIDE)('spots %s', (_name, ua, kind) => {
    expect(detectInAppBrowser(ua)).toBe(kind)
  })

  it.each(OUTSIDE)('leaves %s alone', (_name, ua) => {
    expect(detectInAppBrowser(ua)).toBeNull()
  })
})

describe('androidChromeIntent', () => {
  const url = 'https://app.example.cat/?invite=ABCD-1234'
  const intent = androidChromeIntent(url)

  it('keeps host, path and the whole query, the code included', () => {
    expect(intent.startsWith('intent://app.example.cat/?invite=ABCD-1234#Intent;')).toBe(true)
  })

  it('targets Chrome over https and falls back to the same page', () => {
    expect(intent).toContain('scheme=https;')
    expect(intent).toContain('package=com.android.chrome;')
    expect(intent).toContain(`S.browser_fallback_url=${encodeURIComponent(url)};end`)
  })

  it('carries ports and plain http, for a local run', () => {
    expect(androidChromeIntent('http://localhost:5026/a?b=1')).toBe(
      `intent://localhost:5026/a?b=1#Intent;scheme=http;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent('http://localhost:5026/a?b=1')};end`,
    )
  })

  it('drops the fragment, which would end the intent early', () => {
    expect(androidChromeIntent('https://x.cat/?i=1#top')).not.toContain('#top')
  })
})
