import { beforeAll, describe, expect, it } from 'vitest'

import { type Client, as, rpc } from './helpers'

/**
 * El desplegable «De quina nit» de l'ajust a mà, tal com arriba.
 *
 * NO ÉS UNA PROVA DE POLÍTIQUES. És aquí perquè aquesta és l'única capa que
 * passa per PostgREST, i el que es demostra és un fet sobre la consulta que
 * `fetchAjustEvents` envia —no sobre la vista—: que el `abast=neq.junta` hi és
 * i que és ell qui treu la reunió de junta de la llista.
 *
 * EL FORAT QUE TANCA. `private.no_points_from_junta_meetings` (migració 48)
 * refusa amb 22023 qualsevol fila de `points_log` penjada d'un esdeveniment
 * d'àmbit junta. La llista oferia igualment la reunió de dimarts, i qui la
 * triava rebia «Torna-ho a provar d'aquí un moment» —un consell que no pot
 * funcionar mai, perquè tornar-hi torna a fallar—. Triar una opció que la base
 * refusa sempre no és un error de l'usuari.
 *
 * LES TRES ASSERCIONS VAN JUNTES i cap serveix sola: que la reunió hi era
 * abans del filtre, que ja no hi és després, i que si hi fos no serviria de
 * res. Sense la primera, la prova passaria igual el dia que la llavor deixés
 * de tenir cap reunió de junta i no provaria res.
 *
 * NOMÉS LLEGEIX. L'única escriptura que intenta és la que ha de fallar, i quan
 * falla no deixa fila: es pot tornar a executar tantes vegades com calgui.
 */

/** «Junta de dimarts»: `abast = 'junta'`, ja passada. */
const REUNIO_DE_JUNTA = '00000000-0000-4000-8000-0000000000e9'

const ARA = () => new Date().toISOString()

let junta: Client

beforeAll(async () => {
  junta = await as('junta_alfa')
})

describe('la llista «De quina nit» de l’ajust a mà', () => {
  it('sense el filtre, la vista sí que li serviria la reunió de junta', async () => {
    // La premissa. `events_public` ha de continuar servint-la —d'aquí les treu
    // la pantalla de reunions—, o sigui que el filtre ha d'anar a la consulta.
    const { data, error } = await junta
      .from('events_public')
      .select('id, titulo, starts_at')
      .lte('starts_at', ARA())
      .order('starts_at', { ascending: false })
      .limit(25)

    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.id)).toContain(REUNIO_DE_JUNTA)
  })

  it('amb el filtre, no la serveix, i continua servint la resta', async () => {
    const { data, error } = await junta
      .from('events_public')
      .select('id, titulo, starts_at, abast')
      .lte('starts_at', ARA())
      .neq('abast', 'junta')
      .order('starts_at', { ascending: false })
      .limit(25)

    expect(error).toBeNull()
    const files = data ?? []
    expect(files.map((r) => r.id)).not.toContain(REUNIO_DE_JUNTA)
    expect(files.every((r) => r.abast !== 'junta')).toBe(true)
    // I no s'ha emportat la llista per davant: d'ajustos se n'ha de poder
    // penjar d'alguna nit.
    expect(files.length).toBeGreaterThan(0)
  })

  it('i si s’hi pengés un ajust, la base el refusaria amb 22023', async () => {
    // El codi, no `toHaveLength(0)`: el disparador RAISE i el que arriba és un
    // error, no una llista buida. Una prova que mirés files passaria per sempre
    // encara que la protecció desaparegués.
    const { error } = await rpc<string>(junta, 'award_points', {
      p_user_id: '00000000-0000-4000-8000-000000000001',
      p_event_id: REUNIO_DE_JUNTA,
      p_motivo: 'manual',
      p_puntos: 5,
      p_nota: 'prova que no ha de quedar enlloc',
    })

    expect(error?.code).toBe('22023')
  })
})
