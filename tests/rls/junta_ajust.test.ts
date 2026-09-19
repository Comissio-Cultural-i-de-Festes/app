import { beforeAll, describe, expect, it } from 'vitest'

// Els TIPUS s'importen aquí i els VALORS dins del `beforeAll`: el mòdul de
// l'app no es pot carregar fins que les variables `VITE_*` apuntin a aquest
// stack, i una importació de només tipus desapareix en compilar i no carrega
// res.
import type { fetchAjustEvents as FetchAjustEvents } from '../../src/features/junta/memberPointsApi'
import type { notaNeta as NotaNeta } from '../../src/features/junta/notaNeta'

import { type Client, as, rpc, serviceClient, stack } from './helpers'

/**
 * L'ajust a mà de la junta, contra la base de debò: el desplegable «De quina
 * nit» i què compta com a nota escrita.
 *
 * NO ÉS UNA PROVA DE POLÍTIQUES. És aquí perquè aquesta és l'única capa on el
 * codi del client i la base són tots dos presents alhora. Les dues coses que
 * s'hi demostren són fets sobre FUNCIONS DEL CLIENT —`fetchAjustEvents` i
 * `notaNeta`—, no sobre cap vista, i cap de les dues es pot provar sense una
 * base a l'altra banda.
 *
 * ES CRIDA LA FUNCIÓ, NO S'HI REPETEIX LA CONSULTA. Abans aquest fitxer tornava
 * a escriure el `.neq('abast', 'junta')` dins de la prova, o sigui que esborrar
 * el filtre del client la deixava verda: el que es provava era la vista, que no
 * és qui té el forat. Per això aquí s'importa el mòdul de l'app i es fa servir
 * el seu client, autenticat com un membre de la junta.
 *
 * EL FORAT DEL DESPLEGABLE. `private.no_points_from_junta_meetings` (migració
 * 48) refusa amb 22023 qualsevol fila de `points_log` penjada d'un
 * esdeveniment d'àmbit junta. La llista oferia igualment la reunió de dimarts,
 * i qui la triava rebia «Torna-ho a provar d'aquí un moment» —un consell que
 * no pot funcionar mai, perquè tornar-hi torna a fallar—. Triar una opció que
 * la base refusa sempre no és un error de l'usuari.
 *
 * EL FORAT DE LA NOTA és el mateix símptoma per un altre camí: `llegeixAjust`
 * validava amb `String.prototype.trim()` i la base amb `private.nota_neta`, que
 * cobreix més caràcters, i el que queia entremig tornava el mateix 22023
 * il·legible. Vegeu `src/features/junta/notaNeta.ts`.
 *
 * NOMÉS ESCRIU EL QUE HA DE FALLAR, i quan falla no deixa fila: es pot tornar
 * a executar tantes vegades com calgui. L'única escriptura de debò és la
 * reunió de junta que es fa ella mateixa.
 */

/**
 * LA REUNIÓ SE LA FA AQUESTA PROVA, I NO LA DEMANA A LA LLAVOR. La reunió de
 * junta sembrada neix `now() + 2 days`, o sigui que és futura el dia que es
 * sembra i passada dos dies després. Les assercions del desplegable parlen de
 * la llista del formulari, que només ofereix el que ja ha passat: agafant-la de
 * la llavor, la prova passava en una base de fa dies i queia en una de nova
 * —que és la que fa la integració contínua a cada execució—.
 *
 * L'identificador porta el rellotge a dins perquè aquesta suite escriu i no
 * desfà res: cada execució es fa la seva i no es troba la de l'anterior.
 */
const REUNIO_DE_JUNTA = `00000000-0000-4000-8000-${String(Date.now()).slice(-12)}`

const ARA = () => new Date().toISOString()

const SOCI = '00000000-0000-4000-8000-000000000001'

let junta: Client
let fetchAjustEvents: typeof FetchAjustEvents
let notaNeta: typeof NotaNeta

/** Perquè el missatge d'una fallada digui quin caràcter i no una taca. */
const nom = (c: string) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`

beforeAll(async () => {
  junta = await as('junta_alfa')

  const service = serviceClient()
  const { error } = await service.from('events').insert({
    id: REUNIO_DE_JUNTA,
    tipo: 'reunio',
    abast: 'junta',
    starts_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    plazas: null,
    precio_cents: 0,
    puntos: 0,
    published: true,
    created_by: '00000000-0000-4000-8000-0000000000a1',
  })
  if (error) throw error

  const titol = await service
    .from('event_title')
    .insert({ event_id: REUNIO_DE_JUNTA, titulo: 'Junta inventada de fa dos dies' })
  if (titol.error) throw titol.error

  // El client de l'app es configura a `config/env` a partir de les variables
  // `VITE_*`, que a `npm test` les posa `vite.config.ts` i aquí no les posa
  // ningú: les apunta a aquest stack abans d'importar el mòdul, i per això la
  // importació és dinàmica i no de dalt del fitxer.
  //
  // Valors inventats per als que no són l'adreça, com a tota la llavor.
  process.env.VITE_SUPABASE_URL = stack.apiUrl
  process.env.VITE_SUPABASE_ANON_KEY = stack.anonKey
  process.env.VITE_APP_NAME ??= 'Associació de Proves'
  process.env.VITE_APP_SHORT_NAME ??= 'proves.'

  const { supabase } = await import('../../src/lib/supabase')
  const entrada = await supabase.auth.signInWithPassword({
    email: 'junta_alfa@example.test',
    password: 'test-password-0000',
  })
  if (entrada.error) throw entrada.error
  ;({ fetchAjustEvents } = await import('../../src/features/junta/memberPointsApi'))
  ;({ notaNeta } = await import('../../src/features/junta/notaNeta'))
})

describe('la llista «De quina nit» de l’ajust a mà', () => {
  it('sense el filtre, la vista sí que li serviria la reunió de junta', async () => {
    // La premissa, i l'única consulta escrita a mà d'aquest bloc. `events_public`
    // ha de continuar servint-la —d'aquí les treu la pantalla de reunions—, o
    // sigui que el filtre ha d'anar a la consulta del client. Sense aquesta
    // asserció, la de sota passaria igual el dia que la vista deixés de servir
    // cap reunió de junta i no provaria res.
    const { data, error } = await junta
      .from('events_public')
      .select('id, titulo, starts_at')
      .lte('starts_at', ARA())
      .order('starts_at', { ascending: false })
      .limit(25)

    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.id)).toContain(REUNIO_DE_JUNTA)
  })

  it('i `fetchAjustEvents` no la serveix, i continua servint la resta', async () => {
    // LA FUNCIÓ, no una còpia de la seva consulta: esborrar-li el `.neq` ha de
    // posar aquesta asserció vermella, que és tot el sentit que té.
    const files = await fetchAjustEvents(25)

    expect(files.map((r) => r.id)).not.toContain(REUNIO_DE_JUNTA)
    // I no s'ha emportat la llista per davant: d'ajustos se n'ha de poder
    // penjar d'alguna nit.
    expect(files.length).toBeGreaterThan(0)
    // I el que serveix ja ha passat, que és l'altra meitat de la consulta.
    expect(files.every((r) => r.starts_at <= ARA())).toBe(true)
  })

  it('i si s’hi pengés un ajust, la base el refusaria amb 22023', async () => {
    // El codi, no `toHaveLength(0)`: el disparador RAISE i el que arriba és un
    // error, no una llista buida. Una prova que mirés files passaria per sempre
    // encara que la protecció desaparegués.
    const { error } = await rpc<string>(junta, 'award_points', {
      p_user_id: SOCI,
      p_event_id: REUNIO_DE_JUNTA,
      p_motivo: 'manual',
      p_puntos: 5,
      p_nota: 'prova que no ha de quedar enlloc',
    })

    expect(error?.code).toBe('22023')
  })
})

/**
 * Els candidats a blanc, que no és cap contracte: és el tram on hi ha alguna
 * cosa a descobrir. Tot el que sigui més amunt de U+3000 no és blanc enlloc
 * excepte la marca d'ordre de bytes.
 *
 * U+0000 no hi és perquè Postgres no el pot desar dins d'un `text` i el que
 * tornaria seria un error d'una altra cosa.
 */
const fins = (des: number, fi: number) => Array.from({ length: fi - des + 1 }, (_, i) => des + i)

const CANDIDATS = [
  ...fins(0x0001, 0x0020), // els de control i l'espai
  0x0061, // una lletra, que és la tanca de l'altra banda
  0x0085,
  0x00a0,
  0x1680,
  0x180e, // el separador de vocals mongol, que va deixar de ser blanc a Unicode 6.3
  ...fins(0x2000, 0x2010),
  0x2028,
  0x2029,
  0x202f,
  0x205f,
  0x2060, // l'unidor de paraules
  0x3000,
  0xfeff,
]

describe('el formulari refusa exactament el que refusa la base', () => {
  /**
   * COM ES PREGUNTA SENSE ESCRIURE RES. L'ajust es penja de la reunió de junta,
   * que el disparador de la migració 48 refusa sempre. Aleshores les dues
   * respostes possibles són totes dues errors —no queda cap fila— i el MISSATGE
   * les distingeix:
   *
   *   nota en blanc per a la base  → «un ajust a ma vol una nota»
   *   nota escrita per a la base   → «una reunio de junta no reparteix punts»
   *
   * Sense aquest truc caldria acceptar l'escriptura per saber que la base
   * l'accepta, i seixanta files de +5 punts per execució en una base que no
   * desfà res són seixanta mentides al llibre major d'un soci.
   */
  const laBaseHiVeuUnaNota = async (nota: string): Promise<boolean> => {
    const { error } = await rpc<string>(junta, 'award_points', {
      p_user_id: SOCI,
      p_event_id: REUNIO_DE_JUNTA,
      p_motivo: 'manual',
      p_puntos: 5,
      p_nota: nota,
    })
    if (error?.code !== '22023') {
      throw new Error(`resposta inesperada per a ${nom(nota)}: ${error?.code} ${error?.message}`)
    }
    if (error.message === 'un ajust a ma vol una nota') return false
    if (error.message === 'una reunio de junta no reparteix punts') return true
    throw new Error(`missatge inesperat per a ${nom(nota)}: ${error.message}`)
  }

  it('caràcter per caràcter, i en les dues direccions', async () => {
    const desacords: string[] = []
    for (const punt of CANDIDATS) {
      const car = String.fromCodePoint(punt)
      const hiVeuLaBase = await laBaseHiVeuUnaNota(car)
      const hiVeuElClient = notaNeta(car) !== ''
      if (hiVeuLaBase !== hiVeuElClient) {
        desacords.push(
          `${nom(car)}: la base ${hiVeuLaBase ? 'l’accepta' : 'el refusa'} i ` +
            `el formulari ${hiVeuElClient ? 'l’accepta' : 'el refusa'}`,
        )
      }
    }
    expect(desacords).toEqual([])
  })

  it('i una nota de debò entra encara que hi vagi enganxat un blanc', async () => {
    // La meitat que importa tant com l'altra: una verja que es mengés el text
    // seria pitjor que el forat.
    const enganxada = `${String.fromCodePoint(0xfeff)} quota de setembre `
    expect(await laBaseHiVeuUnaNota(enganxada)).toBe(true)
    expect(notaNeta(enganxada)).toBe('quota de setembre')
  })
})
