import { beforeAll, describe, expect, it } from 'vitest'

import { type Client, anonClient, as, F, rpc, serviceClient } from './helpers'

/**
 * El perfil d'un altre soci, arribat com hi arriba l'app: per Kong, per
 * PostgREST i amb un token de debò.
 *
 * QUÈ AFEGEIX AIXÒ SOBRE LA 450, que ja prova les mateixes dues funcions des de
 * dins de la base. Tres coses que pgTAP no pot veure:
 *
 *   Els noms de les columnes que arriben. `member_badges()` torna `titol` i no
 *   `titulo`, i el client llegeix `row.titol`. Un canvi de nom a la migració
 *   passa el `select` de pgTAP i deixa la pantalla amb totes les llegendes
 *   buides, sense cap error enlloc.
 *
 *   La forma de l'incrustat de les nits. `events(...)` arriba com un objecte i
 *   no com una llista d'un, i `row.events?.starts_at` sobre una llista és
 *   `undefined`: la data desapareix i la llista s'ordena sola pel no-res.
 *
 *   Que `anon` reb un error i no una llista buida. Des de dins, un `revoke`
 *   absent i una política que filtra són indistingibles si la taula està buida.
 *
 * REEXECUTABLE, com tot aquest directori: no escriu res. La comprovació que
 * `member_badges()` no reparteix insígnies es fa comptant abans i després de la
 * crida, que és una propietat i no un valor concret, i per tant no depèn de
 * quantes n'hi hagi quan la suite s'executi per segona vegada.
 */

let member: Client
let hidden: Client

beforeAll(async () => {
  member = await as('alfa')
  hidden = await as('hidden_alfa')
})

describe('la ratxa d’un altre soci', () => {
  it('arriba amb els mateixos camps que la teva', async () => {
    const meva = await rpc<Record<string, unknown>>(member, 'my_streak')
    const seva = await rpc<Record<string, unknown>>(member, 'member_streak', { p_user: F.bravo })

    expect(meva.error).toBeNull()
    expect(seva.error).toBeNull()
    expect(Object.keys(seva.data ?? {}).sort()).toEqual(Object.keys(meva.data ?? {}).sort())
    expect(typeof seva.data?.actual).toBe('number')
    expect(typeof seva.data?.millor).toBe('number')
  })

  it('és la mateixa xifra que aquella persona veu de si mateixa', async () => {
    const bravo = await as('bravo')
    const seva = await rpc<Record<string, unknown>>(bravo, 'my_streak')
    const vista = await rpc<Record<string, unknown>>(member, 'member_streak', { p_user: F.bravo })

    expect(vista.data).toEqual(seva.data)
  })

  it('de qui ja no és soci torna null, no un error', async () => {
    const { data, error } = await rpc<unknown>(member, 'member_streak', { p_user: F.baixa })

    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('de qui s’amaga del rànquing surt igual: amagar-se no és desaparèixer', async () => {
    const { data, error } = await rpc<Record<string, unknown>>(member, 'member_streak', {
      p_user: F.hidden,
    })

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(typeof data?.actual).toBe('number')
  })
})

describe('les insígnies d’un altre soci', () => {
  it('arriben amb els noms de columna que la pantalla llegeix', async () => {
    // Primer se’n garanteix alguna: `my_badges()` les reparteix, i qualsevol
    // soci del seed que hagi assistit a alguna cosa n’hi té dret. Fer-ho amb la
    // seva pròpia crida i no inserint files és el que manté la prova
    // reexecutable.
    const bravo = await as('bravo')
    await rpc<unknown[]>(bravo, 'my_badges')

    const { data, error } = await rpc<Record<string, unknown>[]>(member, 'member_badges', {
      p_user: F.bravo,
    })

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)

    const row = data?.[0]
    if (row !== undefined) {
      expect(Object.keys(row).sort()).toEqual(
        ['codi', 'earned_at', 'event_id', 'starts_at', 'titol'].sort(),
      )
      // I sobretot: `nova` no hi és. És «encara no te l’has mirada», que és una
      // cosa teva, i treure-la és el que fa que des d’aquí no hi hagi cap camí
      // cap a `mark_badges_seen()`.
      expect(row).not.toHaveProperty('nova')
    }
  })

  it('no en reparteix cap: mirar el perfil d’algú no li regala res', async () => {
    const service = serviceClient()
    const abans = await service
      .from('badges')
      .select('codi', { count: 'exact', head: true })
      .eq('user_id', F.golf)

    const { error } = await rpc<unknown[]>(member, 'member_badges', { p_user: F.golf })
    expect(error).toBeNull()

    const despres = await service
      .from('badges')
      .select('codi', { count: 'exact', head: true })
      .eq('user_id', F.golf)

    expect(despres.count).toBe(abans.count)
  })

  it('de qui ja no és soci no en torna cap', async () => {
    const { data, error } = await rpc<unknown[]>(member, 'member_badges', { p_user: F.baixa })

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('la porta de les dues funcions', () => {
  it('anon no hi arriba, i rep un error en comptes d’una llista buida', async () => {
    const fora = anonClient()

    const ratxa = await rpc<unknown>(fora, 'member_streak', { p_user: F.alfa })
    const insignies = await rpc<unknown[]>(fora, 'member_badges', { p_user: F.alfa })

    expect(ratxa.error).not.toBeNull()
    expect(ratxa.data).toBeNull()
    expect(insignies.error).not.toBeNull()
    expect(insignies.data).toBeNull()
  })

  it('qui encara espera l’alta rep un 42501 a totes dues', async () => {
    const espera = await as('pendent_alfa')

    const ratxa = await rpc<unknown>(espera, 'member_streak', { p_user: F.alfa })
    const insignies = await rpc<unknown[]>(espera, 'member_badges', { p_user: F.alfa })

    expect(ratxa.error?.code).toBe('42501')
    expect(insignies.error?.code).toBe('42501')
  })

  it('i un soci actiu sí, que és el control que fa que les dues de dalt diguin res', async () => {
    const ratxa = await rpc<unknown>(member, 'member_streak', { p_user: F.bravo })
    const insignies = await rpc<unknown[]>(member, 'member_badges', { p_user: F.bravo })

    expect(ratxa.error).toBeNull()
    expect(insignies.error).toBeNull()
  })
})

describe('la capçalera i les nits del perfil, sense cap migració al darrere', () => {
  it('un soci llegeix la fila d’un altre soci actiu', async () => {
    const { data, error } = await member
      .from('profiles')
      .select('id, nombre, avatar_url, escola, grau, curs, created_at, estat')
      .eq('id', F.bravo)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data?.id).toBe(F.bravo)
    expect(data?.estat).toBe('actiu')
  })

  it('i no la de qui ja no hi és: la pantalla ho ha de poder dir', async () => {
    const { data, error } = await member
      .from('profiles')
      .select('id, estat')
      .eq('id', F.baixa)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('també la de qui s’amaga del rànquing, que segueix sent soci', async () => {
    const { data, error } = await member
      .from('profiles')
      .select('id, nombre, estat')
      .eq('id', F.hidden)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data?.id).toBe(F.hidden)
  })

  it('incrusta l’activitat com un objecte i no com una llista d’un', async () => {
    // La consulta de `fetchMemberNights`, literal. Un sol literal de cadena:
    // supabase-js llegeix la llista de columnes a nivell de tipus i qualsevol
    // concatenació la deixa com una fila de forma desconeguda.
    const { data, error } = await member
      .from('attendances')
      .select('event_id, events!attendances_event_id_fkey(starts_at, tipo, event_title(titulo))')
      .eq('user_id', F.alfa)
      .eq('estado', 'asistio')

    expect(error).toBeNull()
    for (const row of data ?? []) {
      expect(Array.isArray(row.events)).toBe(false)
      if (row.events !== null) {
        expect(typeof row.events.starts_at).toBe('string')
        expect(Array.isArray(row.events.event_title)).toBe(false)
      }
    }
  })

  it('i qui s’amaga del rànquing veu igualment el perfil dels altres', async () => {
    const { data, error } = await hidden
      .from('profiles')
      .select('id')
      .eq('id', F.alfa)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data?.id).toBe(F.alfa)
  })
})
