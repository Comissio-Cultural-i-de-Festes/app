import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { anonClient, as, F, rpc, serviceClient } from './helpers'

/**
 * El rebedor de la junta, per Kong i amb un token de debò.
 *
 * `junta_home()` és l'única consulta d'aquella pantalla: un sol `jsonb` del
 * qual pengen l'avís de «hi ha feina», el subtítol, la rodona de la fila de
 * Pagaments i la suma de l'encapçalament. La pgTAP el prova des de dins de la
 * base, on hi ha `set role` i prou; aquí es prova el que allà no es veu.
 *
 * QUÈ HI HA AQUÍ QUE NO HI HAGI A LA pgTAP. Tres coses, i cadascuna ha estat
 * un error de debò en algun projecte:
 *
 *   El grant. `create or replace function` torna a donar EXECUTE a PUBLIC, i
 *   la migració 69 va haver de tornar a revocar-lo. Des de dins es veu amb
 *   `has_function_privilege`; des de fora es veu amb la resposta que rep qui
 *   no hi té res a fer, que és el que compta.
 *
 *   La forma. `jsonb` arriba com un objecte i no com una llista d'un, i les
 *   claus són les que `DoorNow` declara a `homeApi.ts`. Una clau mal escrita
 *   no és cap error: és `undefined`, i el número no es dibuixa.
 *
 *   El 42501. Una excepció de plpgsql que travessa PostgREST arriba com a
 *   error amb codi, no com a llista buida. Si algun dia arribés buida, la
 *   pantalla d'un soci ensenyaria zeros en comptes d'anar-se'n.
 *
 * I, sobretot, el cas bessó de la issue: la mateixa gent, la mateixa absència
 * de `pagado`, i l'únic que canvia és el preu.
 *
 * DES DE LA 89 LA PORTA ÉS UNA LLISTA. `portes` porta tots els esdeveniments
 * de la finestra i `porta` és el primer, i aquí n'hi ha dos d'aquest fitxer:
 * el de sempre i una casa rural que va començar ahir i encara dura. És el cas
 * que la 89 arregla, i el que només es veu de debò quan la resposta travessa
 * PostgREST: que la llista arriba com una llista, i cada element amb les claus
 * de `DoorNow`.
 *
 * L'ESDEVENIMENT ÉS D'AQUEST FITXER. Aquesta suite escriu a la mateixa base i
 * no desfà res, o sigui que la fila té un identificador que no fa servir ningú
 * més, entra amb `upsert` perquè la passada d'ahir no la deixi morta, i se'n
 * va al final. Comença set hores i mitja abans d'ara, dins de les vuit hores
 * enrere de la porta. Les assercions del preu el busquen pel seu id dins de
 * `portes`, i no a `porta`: amb la casa rural d'ahir —o amb qualsevol fila
 * d'una altra suite que caigui a la finestra— el primer ja no és ell.
 */

const EVENT = '00000000-0000-4000-8000-00000000fd09'
const CASA = '00000000-0000-4000-8000-00000000fd89'
const HOUR = 3_600_000

/** El que la pantalla llegeix. Les claus són les de `DoorNow`. */
interface Porta {
  readonly id: string
  readonly titulo: string | null
  readonly starts_at: string
  readonly ends_at: string | null
  readonly plazas: number | null
  readonly diuen_si: number
  readonly fitxats: number
  readonly esperen: number
  readonly no_pagats: number
  readonly gimcana_cua: number | null
}

interface Home {
  readonly porta: Porta | null
  readonly portes: readonly Porta[]
  readonly pendents: number
  readonly esborranys: number
  readonly propers: number
  readonly socis: number
}

async function setPrice(cents: number): Promise<void> {
  const { error } = await serviceClient()
    .from('events')
    .update({ precio_cents: cents })
    .eq('id', EVENT)
  expect(error).toBeNull()
}

async function homeOf(handle: string): Promise<Home> {
  const junta = await as(handle)
  const { data, error } = await rpc<Home>(junta, 'junta_home')
  expect(error).toBeNull()
  expect(data).not.toBeNull()
  return data!
}

async function doorOf(handle: string, id: string = EVENT): Promise<Porta> {
  const porta = (await homeOf(handle)).portes.find((p) => p.id === id) ?? null
  // La porta és la d'aquest fitxer i no una altra que hagi caigut a la
  // finestra: sense això, les assercions del preu passarien mirant una fila
  // que no és la seva.
  expect(porta).not.toBeNull()
  return porta!
}

describe('junta_home vist des de fora, com el veu la pantalla', () => {
  beforeAll(async () => {
    const svc = serviceClient()

    const event = await svc
      .from('events')
      .upsert(
        {
          id: EVENT,
          tipo: 'fiesta',
          abast: 'comi',
          starts_at: new Date(Date.now() - 7.5 * 3_600_000).toISOString(),
          plazas: 20,
          precio_cents: 0,
          puntos: 10,
          published: true,
          created_by: F.juntaAlfa,
        },
        { onConflict: 'id' },
      )
      .select('id')
    expect(event.error).toBeNull()
    expect(event.data).toHaveLength(1)

    await svc
      .from('event_title')
      .upsert({ event_id: EVENT, titulo: 'Berenar inventat al pati' }, { onConflict: 'event_id' })

    // La casa rural: va començar fa trenta hores i s'acaba demà. Amb la regla
    // d'abans de la 89 —vuit hores des de l'inici— ja no seria a la porta.
    const casa = await svc
      .from('events')
      .upsert(
        {
          id: CASA,
          tipo: 'casa_rural',
          abast: 'comi',
          starts_at: new Date(Date.now() - 30 * HOUR).toISOString(),
          plazas: 30,
          precio_cents: 9000,
          puntos: 30,
          published: true,
          created_by: F.juntaAlfa,
        },
        { onConflict: 'id' },
      )
      .select('id')
    expect(casa.error).toBeNull()
    expect(casa.data).toHaveLength(1)
    const titol = await svc
      .from('event_title')
      .upsert({ event_id: CASA, titulo: 'Masia inventada' }, { onConflict: 'event_id' })
    expect(titol.error).toBeNull()
    const details = await svc
      .from('event_details')
      .upsert(
        { event_id: CASA, ends_at: new Date(Date.now() + 20 * HOUR).toISOString() },
        { onConflict: 'event_id' },
      )
    expect(details.error).toBeNull()

    // Tres que hi van i cap pagat, que és l'estat de sortida de tothom:
    // `attendances.pagado` arrenca a false. I un que espera, perquè el número
    // del costat ha de continuar sent el seu.
    const rows = [
      { user_id: F.alfa, event_id: EVENT, estado: 'si', pagado: false },
      { user_id: F.bravo, event_id: EVENT, estado: 'si', pagado: false },
      { user_id: F.charlie, event_id: EVENT, estado: 'si', pagado: false },
      { user_id: F.golf, event_id: EVENT, estado: 'espera', pagado: false },
    ]
    // El fixture s'asserta: si no s'escriu, les assercions de sota compten una
    // taula buida i passen per sempre.
    const seeded = await svc
      .from('attendances')
      .upsert(rows, { onConflict: 'user_id,event_id' })
      .select('user_id')
    expect(seeded.error).toBeNull()
    expect(seeded.data).toHaveLength(rows.length)
  })

  afterAll(async () => {
    // La fila se'n va: mentre hi sigui, és la porta de tothom qui obri el
    // rebedor en aquesta base compartida.
    await serviceClient().from('events').delete().in('id', [EVENT, CASA])
  })

  it('un soci no en treu una llista buida, en treu un 42501', async () => {
    // La diferència que fa que aquesta prova valgui: `toHaveLength(0)` passaria
    // igual el dia que la funció deixés de comprovar qui truca.
    const member = await as('alfa')
    const { data, error } = await rpc<Home>(member, 'junta_home')

    expect(error?.code).toBe('42501')
    expect(error?.message).toContain('nomes junta')
    expect(data).toBeNull()
  })

  it('i qui no ha entrat no la pot executar, perquè no en té el grant', async () => {
    // La 69 fa `create or replace`, que torna a donar EXECUTE a PUBLIC. Les
    // dues línies que ho revoquen són la meitat de la migració que ningú no
    // mira, i aquesta és la resposta que les prova.
    const { error } = await rpc<Home>(anonClient(), 'junta_home')

    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  it('arriba com un objecte amb les claus que la pantalla llegeix', async () => {
    const porta = await doorOf('junta_alfa')

    // Un `jsonb` no ha de tornar dins d'una llista d'un: `data.porta` seria
    // `undefined` i la pantalla no dibuixaria res sense dir per què.
    expect(Array.isArray(porta)).toBe(false)
    expect(porta.titulo).toBe('Berenar inventat al pati')
    expect(porta.plazas).toBe(20)
    expect(typeof porta.diuen_si).toBe('number')
    expect(typeof porta.no_pagats).toBe('number')
    // Zero i cap no són el mateix, i el camí cap a la cua de la gimcana depèn
    // d'aquesta diferència.
    expect(porta.gimcana_cua).toBeNull()
  })

  it('les portes arriben com una llista, i la casa rural d’ahir hi és', async () => {
    const home = await homeOf('junta_alfa')

    expect(Array.isArray(home.portes)).toBe(true)
    const casa = home.portes.find((p) => p.id === CASA)
    expect(casa?.titulo).toBe('Masia inventada')
    // Quan s'acaba, perquè la porta pugui dir de quin dia a quin dia.
    expect(casa?.ends_at).not.toBeNull()
    expect(home.portes.some((p) => p.id === EVENT)).toBe(true)
  })

  it('i la porta de sempre és la primera de la llista', async () => {
    // Un mòbil amb la pantalla d'abans de la 89 només llegeix `porta`, i ha
    // de veure la mateixa que el selector posa primer.
    const home = await homeOf('junta_alfa')

    expect(home.porta).toEqual(home.portes[0])
    // En ordre d'inici: la casa rural va començar abans que cap altra.
    const inicis = home.portes.map((p) => Date.parse(p.starts_at))
    expect(inicis).toEqual([...inicis].sort((a, b) => a - b))
  })

  it('una activitat de franc no té ningú que no hagi pagat', async () => {
    await setPrice(0)
    const porta = await doorOf('junta_alfa')

    expect(porta.diuen_si).toBe(3)
    expect(porta.esperen).toBe(1)
    // El número de la issue. Sense la condició del preu seria 3 —tothom qui
    // ha dit que sí— i les quatre superfícies del rebedor dirien que hi ha
    // feina quan no n'hi ha gens.
    expect(porta.no_pagats).toBe(0)
  })

  it('i la mateixa gent, amb preu, sí que en té', async () => {
    // El bessó: no s'ha tocat ni una fila d'`attendances`, només el preu.
    await setPrice(1500)
    const porta = await doorOf('junta_alfa')

    expect(porta.diuen_si).toBe(3)
    expect(porta.no_pagats).toBe(3)
  })

  it('i marcar-ne un el treu del número, que és per a què serveix la pantalla', async () => {
    const admin = await as('junta_alfa')
    const { data: att } = await serviceClient()
      .from('attendances')
      .select('id')
      .eq('event_id', EVENT)
      .eq('user_id', F.alfa)
      .single()

    const marked = await rpc<unknown>(admin, 'admin_set_paid', {
      p_attendance_id: att?.id ?? '',
      p_pagado: true,
    })
    expect(marked.error).toBeNull()

    const porta = await doorOf('junta_alfa')
    expect(porta.no_pagats).toBe(2)
  })

  it("i el que s'ha marcat no es perd quan l'activitat torna a ser de franc", async () => {
    // El «què no canvia» de la issue, vist des de fora: `attendances.pagado`
    // es queda tal com és. Una activitat pot passar de gratuïta a de pagament
    // i tornar enrere amb la gent ja apuntada, i el que algú hagi cobrat no
    // s'ha d'esborrar perquè avui no es pregunti.
    await setPrice(0)
    const porta = await doorOf('junta_alfa')
    expect(porta.no_pagats).toBe(0)

    const { data } = await serviceClient()
      .from('attendances')
      .select('pagado')
      .eq('event_id', EVENT)
      .eq('user_id', F.alfa)
      .single()
    expect(data?.pagado).toBe(true)

    // I torna a sortir el dia que torna a haver-hi preu.
    await setPrice(1500)
    expect((await doorOf('junta_alfa')).no_pagats).toBe(2)
  })
})
