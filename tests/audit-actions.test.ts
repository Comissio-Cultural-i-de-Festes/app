import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import ca from '../src/i18n/locales/ca.json' with { type: 'json' }
import en from '../src/i18n/locales/en.json' with { type: 'json' }
import es from '../src/i18n/locales/es.json' with { type: 'json' }

/**
 * Every action the database writes to the audit log has a sentence in all
 * three locales.
 *
 * This one is the gap the other two i18n tests cannot see. `i18n-usage` checks
 * the keys the code asks for; `i18n-parity` checks the three locales against
 * each other. But the audit screen builds its key from the DATA —
 * `t(`junta.audit.accio.${row.accio}`)` — so a value the migrations write and
 * the locales do not have fails nowhere: not in the typecheck, not in either
 * i18n test, and not in pgTAP. It shows up as a line in the junta's own log
 * that does not say who did it.
 *
 * That is not hypothetical. Five of the twenty-one values had no label, and
 * the fallback (`junta.audit.other`) did not interpolate the actor, so
 * transferring ownership of the association read «Ha passat una cosa:
 * transfer_owner» with no name attached. Migration 52 noticed one of the five
 * and only wrote it down.
 *
 * The list of values lives in the CHECK on `audit_log.accio`, added by
 * migration 57, so adding an action forces a migration and the migration
 * forces the labels.
 */

const MIGRATION = 'supabase/migrations/20260904120000_57_el_registre_diu_qui.sql'

/** The values inside `check (accio in ( … ))`. */
function actionsFromCheck(): string[] {
  const sql = readFileSync(MIGRATION, 'utf8')
  const block = /add constraint audit_log_accio_check check \(accio in \(([^)]*)\)/.exec(sql)
  if (block === null) throw new Error(`no CHECK on accio found in ${MIGRATION}`)
  return [...block[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
}

const LOCALES = { ca, es, en } as const

function labels(locale: keyof typeof LOCALES): Record<string, string> {
  return LOCALES[locale].junta.audit.accio
}

describe('the audit log says who did what', () => {
  const actions = actionsFromCheck()

  // Without this, an extraction that silently returned nothing would make
  // every assertion below vacuously true — the same trap the usage test
  // guards against next door.
  it('finds the action list at all, so an empty pass means nothing', () => {
    expect(actions.length).toBe(21)
    expect(actions).toContain('transfer_owner')
    expect(new Set(actions).size).toBe(actions.length)
  })

  for (const locale of ['ca', 'es', 'en'] as const) {
    it(`${locale}.json has a sentence for every action`, () => {
      const missing = actions.filter((a) => typeof labels(locale)[a] !== 'string')
      expect(missing).toEqual([])
    })

    // The other direction. A label for an action nothing writes is dead
    // weight that reads as coverage.
    it(`${locale}.json has no sentence for an action nothing writes`, () => {
      const extra = Object.keys(labels(locale)).filter((k) => !actions.includes(k))
      expect(extra).toEqual([])
    })
  }

  /**
   * The fallback has to name the actor too.
   *
   * It is what an action gets before somebody writes its label, and the whole
   * point of the log is that it carries a name. `reveal_push` is the one
   * action written by the cron with a null actor, so it is the one label that
   * deliberately has no `{{actor}}`.
   */
  it('names the actor in the fallback, in all three locales', () => {
    for (const locale of ['ca', 'es', 'en'] as const) {
      const fallback = LOCALES[locale].junta.audit.other
      expect(fallback, locale).toContain('{{actor}}')
      expect(fallback, locale).toContain('{{accio}}')
    }
  })

  it('names the actor in every label except the one the cron writes', () => {
    for (const locale of ['ca', 'es', 'en'] as const) {
      const withoutActor = Object.entries(labels(locale))
        .filter(([, v]) => !v.includes('{{actor}}'))
        .map(([k]) => k)
      expect(withoutActor, locale).toEqual(['reveal_push'])
    }
  })
})
