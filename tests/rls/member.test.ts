import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

    // AMB ZERO FILES AQUESTA PROVA NO PROVA RES, i abans se n’anava en silenci:
    // la comprovació dels noms de columna vivia dins d’un `if (row !==
    // undefined)`, o sigui que el dia que el seed deixés bravo sense cap
    // insígnia, l’única asserció que justifica el fitxer sencer deixava de
    // córrer i el fitxer sortia verd. PostgREST torna `[]` sense cap nom de
    // columna a dins, així que la fila hi ha de ser: aquesta línia és la que
    // converteix aquell silenci en un vermell.
    expect(data?.length ?? 0).toBeGreaterThan(0)

    const row = data?.[0] ?? {}
    expect(Object.keys(row).sort()).toEqual(
      ['codi', 'earned_at', 'event_id', 'starts_at', 'titol'].sort(),
    )
    // I sobretot: `nova` no hi és. És «encara no te l’has mirada», que és una
    // cosa teva, i treure-la és el que fa que des d’aquí no hi hagi cap camí
    // cap a `mark_badges_seen()`.
    expect(row).not.toHaveProperty('nova')
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
      .select(
        'event_id, events!attendances_event_id_fkey(starts_at, tipo, event_details(ends_at), event_title(titulo))',
      )
      .eq('user_id', F.alfa)
      .eq('estado', 'asistio')

    expect(error).toBeNull()

    let ambActivitat = 0
    for (const row of data ?? []) {
      expect(Array.isArray(row.events)).toBe(false)
      if (row.events !== null) {
        ambActivitat += 1
        expect(typeof row.events.starts_at).toBe('string')
        expect(Array.isArray(row.events.event_title)).toBe(false)
        // `ends_at` no és a `events`, és a la filla que la revelació tapa.
        // Demanar-l'ho a `events` compila i passa per pgTAP i contesta 42703
        // aquí, que és l'únic lloc on es veu.
        expect(Array.isArray(row.events.event_details)).toBe(false)
      }
    }

    // El mateix forat que a les insígnies, i aquí doble: un `for` sobre `data ??
    // []` no falla mai quan no hi ha files, i l’`if` de dins tampoc quan
    // l’incrustat arriba buit. Alfa té assistències al seed i el que això fixa
    // és que en quedi alguna: sense cap, el fitxer diria que la forma de
    // l’incrustat és correcta sense haver-ne vist cap.
    //
    // AQUEST CAS NO COBREIX L’EXCLUSIÓ DE LES REUNIONS DE JUNTA, i abans deia
    // que sí: les quatre assistències d’Alfa són d’esdeveniments `abast =
    // 'comi'` —una és una reunió, però de la comi— o sigui que cap fila no
    // arriba mai amb `events` a null i la branca que això descrivia no es
    // recorre. Qui comprova aquella regla, amb el seu control positiu al
    // costat, és `supabase/tests/475_les_nits_del_perfil.test.sql`. Una nota
    // que diu «això ja hi és cobert» dins d’un fitxer que existeix per cobrir
    // és exactament el que fa que ningú no hi torni.
    expect(ambActivitat).toBeGreaterThan(0)
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

/**
 * Per què el filtre de les nits ha de ser al client, dit per PostgREST.
 *
 * AQUEST BLOC NO COMPROVA QUE LA REUNIÓ DE JUNTA NO SURTI. Comprova el
 * contrari: que amb un token de la junta la base SÍ que la serveix, sencera i
 * amb el títol. No és cap defecte i no s'ha de tapar —`att_select_admin` i
 * `events_select_admin` hi són a posta, i d'allà en viu `/junta/reunions`—, i
 * és exactament el motiu pel qual «la reunió de junta no surt al perfil públic»
 * no pot ser cap propietat de l'esquema: la base fa el que ha de fer i la
 * pantalla és qui tria. Qui la tapa és `fetchMemberNights`, i qui ho prova és
 * `src/features/member/api.test.ts`.
 *
 * ÉS UNA REIXA, DONCS. El dia que algú decideixi moure la regla a la base —una
 * funció `definer`, com `member_badges()`— aquest bloc caurà, i caure és el que
 * ha de fer: aleshores el filtre del client sobra i s'ha de treure. Sense
 * aquesta prova, les dues còpies de la regla es quedarien totes dues i ningú no
 * sabria que una ja no cal.
 *
 * LES COLUMNES ES LLEGEIXEN DEL FITXER DE L'APP, com fa
 * `tests/award-points-allowlist` amb les migracions, i no s'importen: aquesta
 * suite no té l'àlies `@` ni les variables `VITE_*`, i donar-li'ls per treure
 * una cadena voldria dir muntar-li un segon client de Supabase —el de l'app—
 * al costat del que ja fa servir. El que es vol és que les dues no divergeixin,
 * i per això es comprova que la cadena d'aquí és la que `api.ts` té escrita:
 * una prova sobre una consulta que la pantalla ja no fa és pitjor que cap.
 *
 * REEXECUTABLE, com tot aquest directori: identificadors nous a cada execució i
 * les files es treuen al final.
 */
const NIGHT_COLUMNS =
  'event_id, events!attendances_event_id_fkey(abast, starts_at, tipo, event_details(ends_at), event_title(titulo))'

describe('la reunió de junta, vista per PostgREST amb un token de la junta', () => {
  const reunio = randomUUID()
  const trobada = randomUUID()
  const TITOL_JUNTA = 'Reunio tancada inventada'
  const TITOL_COMI = 'Trobada oberta inventada'

  it('demana exactament les columnes que `fetchMemberNights` demana', () => {
    const font = readFileSync('src/features/member/api.ts', 'utf8')
    const escrita = /export const NIGHT_COLUMNS =\s*\n?\s*'([^']+)'/.exec(font)?.[1]

    // Si això falla, la de dalt s'ha de posar al dia: la prova ha de parlar de
    // la consulta que la pantalla fa avui.
    expect(escrita).toBe(NIGHT_COLUMNS)
  })

  beforeAll(async () => {
    const svc = serviceClient()
    await svc.from('events').insert([
      {
        id: reunio,
        tipo: 'reunio',
        abast: 'junta',
        starts_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
        puntos: 0,
        published: true,
      },
      {
        id: trobada,
        tipo: 'reunio',
        abast: 'comi',
        starts_at: new Date(Date.now() - 19 * 86_400_000).toISOString(),
        puntos: 0,
        published: true,
      },
    ])
    await svc.from('event_title').insert([
      { event_id: reunio, titulo: TITOL_JUNTA },
      { event_id: trobada, titulo: TITOL_COMI },
    ])
    // La mateixa fila a totes dues: el que ha de canviar és qui la pot llegir.
    await svc.from('attendances').insert([
      { user_id: F.bravo, event_id: reunio, estado: 'asistio' },
      { user_id: F.bravo, event_id: trobada, estado: 'asistio' },
    ])
  })

  afterAll(async () => {
    const svc = serviceClient()
    await svc.from('attendances').delete().in('event_id', [reunio, trobada])
    await svc.from('events').delete().in('id', [reunio, trobada])
  })

  interface Fila {
    event_id: string
    events: { abast: string; event_title: { titulo: string } | null } | null
  }

  async function nits(client: Client): Promise<Fila[]> {
    const { data, error } = await client
      .from('attendances')
      .select(NIGHT_COLUMNS)
      .eq('user_id', F.bravo)
      .eq('estado', 'asistio')
    expect(error).toBeNull()
    // Sense cap `as`: els tipus generats ja donen aquesta forma a l'incrustat,
    // i era justament el que la 450 no podia comprovar des de dins de la base.
    return data ?? []
  }

  it('a un soci ras l’incrustat li arriba buit, que és la branca que el client ja tenia', async () => {
    const files = await nits(await as('alfa'))

    expect(files.find((f) => f.event_id === reunio)?.events ?? null).toBeNull()
    // El control positiu: la de la comi sí, i amb el títol.
    expect(files.find((f) => f.event_id === trobada)?.events?.event_title?.titulo).toBe(TITOL_COMI)
  })

  it('i a la junta li arriba sencera, amb l’abast i amb el títol', async () => {
    const files = await nits(await as('junta_alfa'))
    const seva = files.find((f) => f.event_id === reunio)

    // Si això deixés de ser cert, el filtre de `fetchMemberNights` sobraria.
    expect(seva?.events).not.toBeNull()
    expect(seva?.events?.abast).toBe('junta')
    expect(seva?.events?.event_title?.titulo).toBe(TITOL_JUNTA)
  })
})
