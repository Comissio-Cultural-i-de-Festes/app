import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * Every rule in base.css must live inside a cascade layer.
 *
 * This is not tidiness. Tailwind emits its utilities inside `@layer utilities`,
 * and unlayered CSS beats every layer regardless of specificity. An unlayered
 * `button { font: inherit }` in base.css therefore wins over `font-display`
 * and `text-[24px]` on a button — the class is in the DOM, the rule is in the
 * stylesheet, and the button still renders in the body face at the inherited
 * size.
 *
 * It cost an hour to find the first time, because everything looks correct
 * except the pixels. Nothing about the symptom points at the cause, so the
 * cause is asserted here instead.
 */

const css = readFileSync('src/styles/base.css', 'utf8')

/** Strips comments, then returns the at-rule preludes at nesting depth 0. */
function topLevelBlocks(source: string): string[] {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks: string[] = []
  let depth = 0
  let start = 0

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (ch === '{') {
      if (depth === 0) blocks.push(clean.slice(start, i).trim())
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) start = i + 1
    }
  }
  return blocks
}

describe('base.css cascade layers', () => {
  it('opens no rule outside a layer, so utilities can still win', () => {
    const stray = topLevelBlocks(css).filter((prelude) => !prelude.startsWith('@'))

    expect(
      stray,
      'These rules sit outside a cascade layer and therefore beat every ' +
        'Tailwind utility, whatever the specificity:\n  ' +
        stray.join('\n  '),
    ).toEqual([])
  })

  it('puts element resets in base and shared classes in components', () => {
    expect(css).toMatch(/@layer base\s*\{/)
    expect(css).toMatch(/@layer components\s*\{/)

    // The reset most likely to swallow a utility: `font` is a shorthand, so it
    // resets family, size, weight and leading in one go.
    const baseBlock = css.slice(css.indexOf('@layer base'), css.indexOf('@layer components'))
    expect(baseBlock).toContain('font: inherit')
  })

  it('leaves the reduced-motion override unlayered on purpose', () => {
    // It is all `!important`, and an unlayered `!important` outranks a layered
    // one. Somebody who asked their phone to stop animating things should win
    // against anything the app declares.
    const preludes = topLevelBlocks(css)
    expect(preludes).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
