import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { SCAN_PRESENTATION, type CheckInStatus, type StateTone, toneVar } from './states'

// Read off disk rather than importing: `?raw` on a stylesheet comes back empty
// once the Tailwind plugin is in the pipeline.
const tokens = readFileSync('src/styles/tokens.css', 'utf8')

/** Pulls the hue out of `--ds-name: oklch(L C H);`. */
function hueOf(token: string): number {
  const m = new RegExp(`--ds-${token}:\\s*oklch\\(\\s*[\\d.]+\\s+[\\d.]+\\s+([\\d.]+)`).exec(tokens)
  if (!m?.[1]) throw new Error(`--ds-${token} not found in tokens.css, or not an oklch() literal`)
  return Number(m[1])
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
        const gap = Math.abs(hueOf(a) - hueOf(b))
        expect(
          gap,
          `--ds-${a} and --ds-${b} are only ${String(gap)} degrees apart`,
        ).toBeGreaterThan(40)
      }
    }
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
