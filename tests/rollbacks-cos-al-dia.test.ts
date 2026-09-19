import { globSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Un rollback no pot desfer, en silenci, una migració posterior.
 *
 * EL CAS QUE HO VA FER FALTA. El rollback de la 76 portava el cos
 * d'`award_points` de la 72, perquè la 72 era el cos de referència el dia que
 * es va escriure. La 77 va canviar aquella funció per corregir la neteja de la
 * nota —un `btrim` d'un sol argument que només treu U+0020, o sigui que un
 * tabulador passava per nota i amb ell queia la verja del negatiu sencera— i el
 * rollback de la 76 es va quedar amb la línia vella. `create or replace` no
 * avisa de res: desfer la 76 reobria el forat del tabulador sense dir-ho.
 *
 * Un rollback que et deixa una vulnerabilitat oberta sense dir-ho és pitjor que
 * no tenir-ne cap, i el defecte no es veu executant-lo: la funció es crea, la
 * porta contesta 200 i el forat és a dins.
 *
 * PER QUÈ AQUÍ I NO EN UN pgTAP. `supabase/rollbacks/` no existeix per a la
 * base: no s'aplica mai en un desplegament normal, no és a `schema_migrations`
 * i el contenidor de les proves no el munta. La invariant és entre FITXERS del
 * repositori, i el repositori és l'únic lloc des d'on es pot mirar. Mateixa
 * idea que `award-points-allowlist.test.ts`.
 *
 * LES DUES REGLES. La primera és de documentació i val per a qualsevol funció;
 * la segona és de contingut i val per a la regla de la nota, que és l'única que
 * el repositori ha promès escriure en un sol lloc.
 */

const MIGRATIONS = globSync('supabase/migrations/*.sql').sort()
const ROLLBACKS = globSync('supabase/rollbacks/*.sql').sort()

const DEFINEIX = /create\s+or\s+replace\s+function\s+([a-z_]+\.[a-z_0-9]+)\s*\(/gi

/** El número de migració d'un nom de fitxer: `..._76_conduir...` → `76`. */
function numero(file: string): string {
  const m = /^(?:\d{14}_)?([0-9]+[a-z]?)_/.exec(basename(file))?.[1]
  if (m === undefined) throw new Error(`nom de fitxer inesperat: ${file}`)
  return m
}

function funcions(file: string): Set<string> {
  return new Set(
    [...readFileSync(file, 'utf8').matchAll(DEFINEIX)].map((m) => (m[1] ?? '').toLowerCase()),
  )
}

/**
 * La capçalera: tot el que hi ha abans de la primera sentència.
 *
 * És on mira qui ha d'executar el fitxer, i per tant l'únic lloc on un avís
 * d'ordre compta. Escrit al mig del cos no el llegeix ningú a temps.
 */
function capcalera(file: string): string {
  const txt = readFileSync(file, 'utf8')
  const i = txt.search(/^\s*(create|do|alter|insert|update|delete|drop|revoke|grant|comment)\b/im)
  return i === -1 ? txt : txt.slice(0, i)
}

const ORDRE = new Map(MIGRATIONS.map((f) => [numero(f), f]))

/** Les migracions que tornen a escriure `fn` DESPRÉS de la migració `num`. */
function posteriors(num: string, fn: string): string[] {
  const jo = ORDRE.get(num)
  if (jo === undefined) throw new Error(`cap migració amb el número ${num}`)
  return MIGRATIONS.filter((f) => f > jo && funcions(f).has(fn)).map(numero)
}

describe('els rollbacks no desfan el que ve després', () => {
  it.each(ROLLBACKS.map((f) => [basename(f), f]))(
    '%s anomena a la capçalera cada migració posterior que toca les seves funcions',
    (_nom, file) => {
      const num = numero(file)
      const head = capcalera(file)
      for (const fn of funcions(file)) {
        for (const n of posteriors(num, fn)) {
          expect(
            head,
            `aquest fitxer reescriu ${fn} i la migració ${n} també: desfer-lo la desfà, i la ` +
              `capçalera no ho diu. O s'hi escriu, o el cos es reescriu sobre el de la ${n}.`,
          ).toMatch(new RegExp(`\\b${n}\\b`))
        }
      }
    },
  )

  /*
   * La segona regla, i per què és només la meitat negativa.
   *
   * Des de la 77 la neteja d'una nota viu en UNA funció, i la 77 explica per
   * què: la mateixa expressió estava escrita a mà a cinc llocs del repositori i
   * era equivocada a tots cinc, perquè es va copiar cinc vegades en comptes de
   * cridar-se cinc vegades. `btrim(text)` amb un sol argument treu U+0020 i cap
   * altre blanc, o sigui que un tabulador hi passa per nota.
   *
   * NOMÉS ES MIRA ON LA REGLA JA HI ÉS. La 77 en va corregir una de cinc i diu
   * quines queden —`avisa`, `admin_decide_proposal`, l'acta i l'etiqueta
   * d'`avis_tipus`—; un rollback que torni a una versió d'aquelles funcions ha
   * de portar el `btrim` que la base té avui, i marcar-l'hi seria demanar-li que
   * arregli una cosa que no desfà. La condició és, doncs: si l'última migració
   * que defineix la funció ja crida `private.nota_neta`, el rollback no pot
   * tornar a escriure-la a mà.
   *
   * Tampoc es demana que la CRIDI: hi ha rollbacks que tornen a un cos anterior
   * a la 72, on la nota encara no era obligatòria i no hi havia res a netejar.
   *
   * Els comentaris no compten: la capçalera del rollback de la 76 cita la línia
   * dolenta a posta, per explicar què va passar, i citar-la no és fer-la.
   */
  it.each(ROLLBACKS.map((f) => [basename(f), f]))(
    '%s no torna a escriure a mà la neteja de la nota que la 77 va tancar en una funció',
    (_nom, file) => {
      const alDia = [...funcions(file)].some((fn) => {
        const ultima = MIGRATIONS.filter((f) => funcions(f).has(fn)).at(-1)
        return ultima !== undefined && readFileSync(ultima, 'utf8').includes('private.nota_neta(')
      })
      if (!alDia) return

      const codi = readFileSync(file, 'utf8').replace(/--[^\n]*/g, '')
      expect(
        codi,
        'la neteja d’una nota es crida, no es copia: `private.nota_neta`, migració 77.',
      ).not.toMatch(/btrim\s*\(\s*coalesce\s*\(\s*p_nota/)
    },
  )
})
