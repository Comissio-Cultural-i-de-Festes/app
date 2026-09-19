import { globSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { notaNeta } from '../src/features/junta/notaNeta'

/**
 * Que el formulari i la base no tornin a dir coses diferents sobre un caràcter.
 *
 * EL FORAT QUE TANCA. `llegeixAjust` validava la nota amb
 * `String.prototype.trim()` i `award_points` amb `private.nota_neta`, que
 * cobreix més caràcters. Una nota d'un sol espai d'amplada zero passava el
 * formulari i la base la refusava amb 22023 —a la pantalla, «Torna-ho a provar
 * d'aquí un moment»: el consell que no pot funcionar mai—. Les dues llistes es
 * van separar perquè ningú no mirava que fossin la mateixa.
 *
 * AQUESTA ÉS LA MEITAT QUE ES POT PROVAR SENSE BASE, i per això viu al suite
 * unitari: llegeix la MIGRACIÓ, que és el que es desplega, i no la funció que
 * hi ha a la base connectada. És la mateixa idea que
 * `award-points-allowlist.test.ts`.
 *
 * LA MEITAT QUE NO ÉS AQUÍ. `[[:space:]]` el decideix el LC_CTYPE de la base
 * —és l'argument sencer que la migració 77 dóna per NO escriure `\S`—, o sigui
 * que expandir-lo des d'aquí seria inventar-se'l. Les dues direccions senceres
 * («ni més ni menys») es comproven contra la base de debò, caràcter per
 * caràcter, a `tests/rls/junta_ajust.test.ts`. Aquí es comprova el que la
 * migració escriu EXPLÍCITAMENT, que és justament la part que algú pot canviar
 * en un fitxer nou sense recordar que hi ha un formulari a l'altra banda.
 */

const MIGRACIONS = globSync('supabase/migrations/*.sql').sort()

/** L'última migració que torna a escriure la funció mana sobre les anteriors. */
function ultimaNotaNeta(): { file: string; body: string } {
  const hits = MIGRACIONS.filter((f) =>
    /create or replace function private\.nota_neta\b/.test(readFileSync(f, 'utf8')),
  )
  const file = hits.at(-1)
  if (file === undefined) throw new Error('cap migració defineix private.nota_neta')
  return { file, body: readFileSync(file, 'utf8') }
}

/**
 * Els caràcters escrits a mà dins de la classe, amb els trams oberts.
 *
 * La classe és `[[:space:]` seguit de la llista i tancada amb `]`, i el `]` de
 * `[:space:]` és l'únic que hi ha abans del final: per això el patró ancora al
 * prefix sencer en comptes de buscar el primer claudàtor.
 */
function blancsExplicitsDeLaMigracio(body: string): string[] {
  // Ancorat a `'^[`, que és el patró i no la prosa: la migració nomena
  // `[[:space:]]` també als comentaris, i sense el prefix la primera
  // coincidència era una frase.
  //
  // `s`: la llista conté U+2028 i U+2029, i sense la bandera `.` no els matxa
  // perquè JavaScript els compta com a final de línia. Són justament dos dels
  // caràcters que s'han de trobar aquí.
  const classe = /'\^\[\[:space:\](.*?)\]\+'/s.exec(body)?.[1]
  if (classe === undefined) throw new Error('no s’ha trobat la classe de blancs a la migració')

  const punts = [...classe]
  const sortida: string[] = []
  for (let i = 0; i < punts.length; i++) {
    if (punts[i + 1] === '-' && punts[i + 2] !== undefined) {
      const desde = punts[i]!.codePointAt(0)!
      const fins = punts[i + 2]!.codePointAt(0)!
      for (let c = desde; c <= fins; c++) sortida.push(String.fromCodePoint(c))
      i += 2
    } else {
      sortida.push(punts[i]!)
    }
  }
  return sortida
}

/** El que `[[:space:]]` governa. Tot el que la migració hi afegeix és de sobre. */
const ON_MANA_LA_CONFIGURACIO_REGIONAL = 0x0100

/** Perquè el missatge d'una fallada digui quin caràcter i no una taca. */
const nom = (c: string) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`

describe('la llista de blancs del formulari i la de la migració', () => {
  it('la migració continua ancorant la seva classe a `[[:space:]]`', () => {
    // Sense aquest prefix, tot el que el client retalla per sota de U+0100
    // deixaria de tenir cap justificació i la prova de sota no provaria res.
    const { file, body } = ultimaNotaNeta()
    expect(body, `l'última definició és a ${file}`).toContain('[[:space:]')
  })

  it('el formulari retalla tot el que la migració hi posa explícitament', () => {
    const { file, body } = ultimaNotaNeta()
    const deixats = blancsExplicitsDeLaMigracio(body).filter((c) => notaNeta(c) !== '')
    expect(deixats.map(nom), `la llista explícita és a ${file}`).toEqual([])
  })

  it('i no en retalla cap que no sigui ni de la migració ni de `[[:space:]]`', () => {
    // La direcció contrària, que és la que faria sortir «falta la nota» amb la
    // nota escrita: un error que qui el veu no té manera de resoldre.
    const explicits = new Set(blancsExplicitsDeLaMigracio(ultimaNotaNeta().body))
    const sobrers: string[] = []
    for (let c = 0x0100; c <= 0xffff; c++) {
      if (c >= 0xd800 && c <= 0xdfff) continue
      const car = String.fromCodePoint(c)
      if (notaNeta(car) === '' && !explicits.has(car)) sobrers.push(car)
    }
    expect(sobrers.map(nom)).toEqual([])
  })

  it('i el que retalla per sota de U+0100 és cosa de `[[:space:]]` i de ningú més', () => {
    // La migració no els nomena —els hereta de la classe POSIX—, i per sota de
    // U+0100 els únics blancs que hi ha són els de control, l'espai i l'espai
    // dur. Que no n'hi hagi cap altre és el que fa que el tram anterior es
    // pugui donar per bo sense expandir `[[:space:]]` des d'aquí.
    const baixos: string[] = []
    for (let c = 0x0001; c < ON_MANA_LA_CONFIGURACIO_REGIONAL; c++) {
      const car = String.fromCodePoint(c)
      if (notaNeta(car) === '') baixos.push(car)
    }
    expect(baixos.map(nom)).toEqual([
      'U+0009',
      'U+000A',
      'U+000B',
      'U+000C',
      'U+000D',
      'U+001C',
      'U+001D',
      'U+001E',
      'U+001F',
      'U+0020',
      'U+0085',
      'U+00A0',
    ])
  })
})
