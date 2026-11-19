// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { keyRefs, keysOutsideDesk, splitLocale } from './localeSplit'

/**
 * On es talla un idioma, sobre codi i fitxers inventats.
 *
 * Que el tall casa amb el que rolldown posa a la precache es comprova sobre un
 * build de debò, a `precache.test.ts`; que les dues parts tornen a fer el fitxer
 * sencer, amb els fitxers de debò, a `src/i18n/junta.test.ts`.
 */

const SRC = '/app/src'

describe('keyRefs', () => {
  it('troba les claus de la junta, dins de t() o no', () => {
    const source = `
      t('junta.title')
      const key = "junta.payments.paid"
      t('home.title')
    `
    expect(keyRefs(source)).toEqual([
      { key: 'junta.title', prefix: false },
      { key: 'junta.payments.paid', prefix: false },
    ])
  })

  it('pren el principi fix de les que es componen', () => {
    expect(keyRefs('t(`junta.pendents.estat.${row.estat}`)')).toEqual([
      { key: 'junta.pendents.estat.', prefix: true },
    ])
    expect(keyRefs('t(`junta.home.door${state}`)')).toEqual([
      { key: 'junta.home.door', prefix: true },
    ])
  })

  it('no llegeix els comentaris com a crides', () => {
    expect(keyRefs("// t('junta.form.title')\n/* t('junta.audit.title') */")).toEqual([])
  })
})

describe('keysOutsideDesk', () => {
  const sources = new Map([
    [`${SRC}/features/event/EventScreen.tsx`, "t('junta.form.points')"],
    [
      `${SRC}/features/junta/JuntaHome.tsx`,
      `import { Block } from './Block'
       import type { Row } from "@/features/junta/types"
       const Audit = lazy(() => import('./AuditScreen'))
       t('junta.home.title')`,
    ],
    [`${SRC}/features/junta/Block.tsx`, "export const Block = () => t('junta.pendents.title')"],
    [`${SRC}/features/junta/types.ts`, "export type Row = 'junta.types.row'"],
    [`${SRC}/features/junta/AuditScreen.tsx`, "t('junta.audit.heading')"],
    [`${SRC}/features/junta/Lonely.tsx`, "t('junta.lonely')"],
  ])
  const isRoot = (file: string) =>
    !file.includes('/features/junta/') || file.endsWith('/JuntaHome.tsx')

  const found = keysOutsideDesk(sources, isRoot, SRC).map(({ key }) => key)

  it('porta les de les pantalles de soci i les de la porta', () => {
    expect(found).toContain('junta.form.points')
    expect(found).toContain('junta.home.title')
  })

  it('i les del que la porta importa, amb camí relatiu o amb @/', () => {
    expect(found).toContain('junta.pendents.title')
    expect(found).toContain('junta.types.row')
  })

  it('i no segueix un import(): és el que separa una pantalla d’escriptori', () => {
    expect(found).not.toContain('junta.audit.heading')
    expect(found).not.toContain('junta.lonely')
  })
})

describe('splitLocale', () => {
  const tree = {
    home: { title: 'Inici' },
    junta: {
      title: 'Junta',
      gimcana: { inQueue_one: '{{count}} a la cua', inQueue_other: '{{count}} a la cua' },
      pendents: { estat: { obert: 'Obert', tancat: 'Tancat' }, title: 'Pendents' },
      home: { doorNow: 'Ara', doorLater: 'Després' },
      audit: { heading: 'Registre', empty: 'Res' },
    },
  }

  const { app, junta } = splitLocale(tree, [
    { key: 'junta.title', prefix: false },
    { key: 'junta.gimcana.inQueue', prefix: false },
    { key: 'junta.pendents.estat.', prefix: true },
    { key: 'junta.home.door', prefix: true },
  ])

  it("deixa a l'app el que fa servir algú de fora, plurals inclosos", () => {
    expect(app).toEqual({
      home: { title: 'Inici' },
      junta: {
        title: 'Junta',
        gimcana: tree.junta.gimcana,
        pendents: { estat: tree.junta.pendents.estat },
        home: tree.junta.home,
      },
    })
  })

  it('i a la junta la resta, i res més', () => {
    expect(junta).toEqual({
      junta: { pendents: { title: 'Pendents' }, audit: tree.junta.audit },
    })
  })

  it('una clau que es demana sencera i és un grup es queda tot el grup', () => {
    const { app: whole } = splitLocale(tree, [{ key: 'junta.audit', prefix: false }])
    expect((whole.junta as Record<string, unknown>).audit).toEqual(tree.junta.audit)
  })
})
