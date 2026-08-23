import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { SCAN_PRESENTATION, type CheckInStatus, type StateTone, toneVar } from './states'

// Read off disk rather than importing: `?raw` on a stylesheet comes back empty
// once the Tailwind plugin is in the pipeline.
const tokens = readFileSync('src/styles/tokens.css', 'utf8')

/** Pulls `oklch(L C H)` apart for `--ds-name`. */
function oklchOf(token: string): { l: number; h: number } {
  const m = new RegExp(`--ds-${token}:\\s*oklch\\(\\s*([\\d.]+)\\s+[\\d.]+\\s+([\\d.]+)`).exec(
    tokens,
  )
  if (!m?.[1] || !m[2]) {
    throw new Error(`--ds-${token} not found in tokens.css, or not an oklch() literal`)
  }
  return { l: Number(m[1]), h: Number(m[2]) }
}

const hueOf = (token: string): number => oklchOf(token).h
const lightnessOf = (token: string): number => oklchOf(token).l

/** Hue is a circle. 350 and 10 are twenty degrees apart, not three hundred. */
function hueGap(a: string, b: string): number {
  const raw = Math.abs(hueOf(a) - hueOf(b)) % 360
  return raw > 180 ? 360 - raw : raw
}

const BRAND_HUE = hueOf('brand')
const entries = Object.entries(SCAN_PRESENTATION) as [
  CheckInStatus,
  (typeof SCAN_PRESENTATION)[CheckInStatus],
][]
const tones = [...new Set(entries.map(([, p]) => p.tone))]

describe('scanner states', () => {
  it('never uses the brand colour for an outcome', () => {
    // The association's red is its identity. If it also meant "rejected", the
    // scanner would be ambiguous exactly when it has to be read instantly.
    const brandish = tones.filter((tone) => Math.abs(hueOf(tone) - BRAND_HUE) < 20)
    expect(
      brandish,
      `these state tones sit within 20 degrees of the brand hue (${String(BRAND_HUE)}): ${brandish.join(', ')}`,
    ).toEqual([])
  })

  it('keeps every state tone clear of every other one', () => {
    // Two warm hues at low brightness read as the same colour. 40 degrees is
    // the gap that survives a dim screen: error (48) to warning (90) is 42.
    for (const a of tones) {
      for (const b of tones) {
        if (a >= b) continue
        const gap = hueGap(a, b)
        expect(
          gap,
          `--ds-${a} and --ds-${b} are only ${String(gap)} degrees apart`,
        ).toBeGreaterThan(40)
      }
    }
  })

  // Red text that is not a state, on the same screens as red text that is.
  const BRAND_TEXT = ['brand-accent', 'brand-label', 'brand-icon', 'link'] as const

  it('keeps a state tone from reading as an ordinary red label', () => {
    // Hue is not enough. `error` sat 23 degrees from `--ds-brand-accent` and
    // within 0.02 of its lightness, which in greyscale is 1.13:1 — the eyebrow
    // above the scanner's verdict card and the verdict itself were the same
    // colour to anyone who cannot separate warm hues. Rotating the hue does
    // not help at equal lightness; separating the lightness does.
    for (const tone of tones) {
      for (const brandish of BRAND_TEXT) {
        // One of the two has to hold. A wide hue gap is enough on its own —
        // the violet "not one of ours" is never mistaken for a red label — but
        // two warm hues at the same lightness are the same colour on a dim
        // screen, and there the lightness is what has to do the work.
        const light = Math.abs(lightnessOf(tone) - lightnessOf(brandish))
        const hue = hueGap(tone, brandish)
        expect(
          light > 0.055 || hue >= 60,
          `--ds-${tone} and --ds-${brandish} are ${light.toFixed(3)} apart in lightness ` +
            `and ${hue.toFixed(0)} degrees apart in hue: too close on both`,
        ).toBe(true)
      }
    }
  })

  it('keeps paid and pending apart in lightness as well as in hue', () => {
    // These two are the rows of one list. They were 59 degrees apart and had
    // IDENTICAL relative luminance — 1.000:1 — so the list was legible in
    // colour and blank in greyscale.
    const gap = Math.abs(lightnessOf('success') - lightnessOf('warning-deep'))
    expect(gap, `success and warning-deep are ${gap.toFixed(3)} apart`).toBeGreaterThan(0.055)
  })

  it('gives every outcome its own icon, because the icon is the real signal', () => {
    const icons = entries.map(([, p]) => p.icon)
    const dupes = icons.filter((icon, i) => icons.indexOf(icon) !== i)
    expect(dupes, `icons reused across outcomes: ${dupes.join(', ')}`).toEqual([])
  })

  it('distinguishes the two walk-in outcomes', () => {
    // A walk-in at a free, unlimited event is simply in. A walk-in at an event
    // with places or a price is also let in — blocking at a door is worse than
    // a row to reconcile later — but the junta must see that they were neither
    // signed up nor paid, so it is amber and it buzzes differently.
    const free = SCAN_PRESENTATION.ok_walkin
    const review = SCAN_PRESENTATION.ok_walkin_review

    expect(free.admitted).toBe(true)
    expect(review.admitted).toBe(true)

    expect(free.tone).toBe<StateTone>('success')
    expect(review.tone).toBe<StateTone>('warning')

    expect(review.icon).not.toBe(free.icon)
    expect(review.haptic).not.toEqual(free.haptic)
  })

  it('resolves tones to real tokens', () => {
    for (const tone of tones) {
      expect(toneVar(tone)).toBe(`var(--ds-${tone})`)
      expect(tokens).toContain(`--ds-${tone}:`)
    }
  })
})
