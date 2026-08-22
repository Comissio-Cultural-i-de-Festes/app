import { describe, expect, it } from 'vitest'

import ca from '../src/i18n/locales/ca.json'
import en from '../src/i18n/locales/en.json'
import es from '../src/i18n/locales/es.json'
import { SCAN_PRESENTATION } from '../src/design/states'

/**
 * Catalan is the source. A key that exists there and is missing elsewhere ends
 * up on screen as a raw key like `errors.qrExpired`, which is the failure mode
 * this file exists to prevent.
 */

interface Tree {
  [key: string]: string | Tree
}

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/
const stripPlural = (key: string): string => key.replace(PLURAL_SUFFIX, '')

function flatten(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    return typeof v === 'string' ? [[path, v] as [string, string]] : flatten(v, path)
  })
}

const source = { locale: 'ca', entries: flatten(ca) }
const targets = [
  { locale: 'es', entries: flatten(es) },
  { locale: 'en', entries: flatten(en) },
]
const all = [source, ...targets]

const sourceKeys = source.entries.map(([k]) => k)
const sourceBases = new Set(sourceKeys.map(stripPlural))

const placeholders = (value: string): string[] =>
  [...value.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1] ?? '').sort()

describe('i18n parity', () => {
  for (const { locale, entries } of targets) {
    it(`${locale}.json defines every key ca.json has`, () => {
      const present = new Set(entries.map(([k]) => k))
      const missing = sourceKeys.filter((k) => !present.has(k))
      expect(
        missing,
        `${String(missing.length)} key(s) missing from ${locale}.json:\n  ${missing.join('\n  ')}`,
      ).toEqual([])
    })
  }

  for (const { locale, entries } of targets) {
    it(`${locale}.json defines no key ca.json lacks`, () => {
      const known = new Set(sourceKeys)
      // A locale may legitimately add a plural category Catalan does not use
      // (Spanish has `many` for 1e6+), so those are allowed through.
      const extra = entries
        .map(([k]) => k)
        .filter((k) => !known.has(k) && !(PLURAL_SUFFIX.test(k) && sourceBases.has(stripPlural(k))))
      expect(
        extra,
        `${String(extra.length)} key(s) in ${locale}.json are not in ca.json:\n  ${extra.join('\n  ')}`,
      ).toEqual([])
    })
  }

  for (const { locale, entries } of all) {
    it(`${locale}.json has no empty values`, () => {
      const empty = entries.filter(([, v]) => v.trim() === '').map(([k]) => k)
      expect(empty, `Empty values in ${locale}.json:\n  ${empty.join('\n  ')}`).toEqual([])
    })
  }

  for (const { locale, entries } of targets) {
    it(`${locale}.json keeps ca.json’s interpolations`, () => {
      const map = new Map(entries)
      const broken: string[] = []
      for (const [key, value] of source.entries) {
        const translated = map.get(key)
        if (translated === undefined) continue // the first test reports this
        const want = placeholders(value).join(',')
        const got = placeholders(translated).join(',')
        if (want !== got) broken.push(`${key}: ca has [${want}], ${locale} has [${got}]`)
      }
      expect(broken, `Interpolation mismatch:\n  ${broken.join('\n  ')}`).toEqual([])
    })
  }

  for (const { locale, entries } of all) {
    it(`${locale}.json never hardcodes the association`, () => {
      // The name comes from configuration so another campus association can
      // reuse this. Interpolate it: t('…', { association: brand.name }).
      const forbidden = /comissi[oó] cultural|tecnocampus/i
      const offenders = entries
        .filter(([, v]) => forbidden.test(v))
        .map(([k, v]) => `${k}: "${v}"  -> use {{association}} from config/brand.ts`)
      expect(offenders, `Hardcoded brand in ${locale}.json:\n  ${offenders.join('\n  ')}`).toEqual(
        [],
      )
    })
  }

  it('has a string for every scanner outcome', () => {
    // states.ts names an i18n key per check-in result. A missing one would
    // show a raw key on the scanner, at the door, mid-event.
    const missing = Object.values(SCAN_PRESENTATION)
      .map((p) => p.messageKey)
      .filter((key) => !sourceKeys.includes(key))
    expect(missing, `scanner keys missing from ca.json: ${missing.join(', ')}`).toEqual([])
  })
})
