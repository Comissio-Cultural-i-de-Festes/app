import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La consulta de les nits d'un altre soci, i sobretot què en llença.
 *
 * PER QUÈ AQUÍ I NO A `nights.test.ts`. El filtre que importa no és una funció
 * pura: és una línia dins de `fetchMemberNights`, i una prova sobre un
 * ajudant exportat passaria verda el dia que algú deixés de cridar-lo. El que
 * es prova aquí és la funció que la pantalla crida de debò, amb PostgREST
 * substituït per un doble que torna el que la base torna a algú de la junta.
 *
 * QUÈ FIXA, I PER QUÈ NO ES POT FIXAR DES DE LA BASE. `att_select_admin` i
 * `events_select_admin` publiquen tota fila a qui compleix `private.is_admin()`,
 * i han de continuar fent-ho: `/junta/reunions` en viu. O sigui que «la reunió
 * de junta no surt al perfil públic» no és cap propietat de l'esquema i cap
 * prova de pgTAP la pot demostrar —la base SÍ que serveix aquella fila, i ha de
 * fer-ho. La regla és de la pantalla, viu al client, i per tant la seva prova
 * també.
 *
 * LES TRES ASSERCIONS SÓN TRES PARELLES, com demana el capçal de la 370: de
 * cada cosa que s'espera fora se'n comprova també una que s'espera dins, perquè
 * el dia que la consulta deixés de tornar res aquest fitxer seguiria verd dient
 * que la junta està tapada.
 *
 * LA TERCERA ÉS LA QUE COSTA DE VEURE. `abast` ha de ser al `select`: sense
 * demanar-la, PostgREST no la torna, `r.events.abast` és `undefined`,
 * `undefined !== 'junta'` és cert i el filtre deixa passar absolutament tot
 * sense fallar enlloc. És un no-op silenciós, i el que el detecta és mirar la
 * cadena que se li ha demanat a la base.
 *
 * Gent i reunions inventades, com a tot el repositori.
 */

let selectDemanat = ''
let files: unknown[] = []

vi.mock('@/lib/supabase', () => {
  // El constructor de consultes de supabase-js encadena i al final és un
  // thenable, no una promesa: `await` sobre ell dispara la petició. El doble
  // ha de tenir la mateixa forma o `unwrapAs` no en treu res.
  const builder = {
    select(columnes: string) {
      selectDemanat = columnes
      return builder
    },
    eq() {
      return builder
    },
    then(onFulfilled: (r: { data: unknown; error: null }) => unknown) {
      return Promise.resolve({ data: files, error: null }).then(onFulfilled)
    },
  }
  return {
    supabase: { from: () => builder, rpc: () => Promise.resolve({ data: null, error: null }) },
    rpc: () => Promise.resolve({ data: null, error: null }),
  }
})

const { fetchMemberNights } = await import('./api')

const JUNTA = '00000000-0000-4000-8000-00000000fa01'
const COMI = '00000000-0000-4000-8000-00000000fa02'

/** Tal com arriba quan qui mira és de la junta: l'incrustat ve sencer. */
function fila(event_id: string, abast: 'comi' | 'junta', titulo: string) {
  return {
    event_id,
    events: {
      abast,
      starts_at: '2026-09-01T18:00:00Z',
      tipo: 'reunio',
      event_details: { ends_at: '2026-09-01T20:00:00Z' },
      event_title: { titulo },
    },
  }
}

beforeEach(() => {
  selectDemanat = ''
  files = []
})

describe('les nits del perfil públic, mirades per algú de la junta', () => {
  it('no hi posa la reunió de junta encara que la base la serveixi sencera', async () => {
    files = [fila(JUNTA, 'junta', 'Reunio tancada inventada')]

    expect(await fetchMemberNights('qui-sigui')).toEqual([])
  })

  it('i sí la de la comi: el buit de sobre no és que no torni res', async () => {
    files = [fila(COMI, 'comi', 'Trobada oberta inventada')]

    const nits = await fetchMemberNights('qui-sigui')

    expect(nits.map((n) => n.event_id)).toEqual([COMI])
  })

  it('no en deixa escapar el títol, que és la meitat del que es filtrava', async () => {
    files = [fila(JUNTA, 'junta', 'Reunio tancada inventada'), fila(COMI, 'comi', 'Oberta')]

    const nits = await fetchMemberNights('qui-sigui')

    expect(nits.map((n) => n.titol)).toEqual(['Oberta'])
  })

  it('continua traient la fila que la política ja ha buidat a un soci ras', async () => {
    // Per a qui no és de la junta, `events` arriba a null i no hi ha res a
    // ensenyar. Aquest cas ja hi era i s'ha de quedar.
    files = [{ event_id: JUNTA, events: null }, fila(COMI, 'comi', 'Oberta')]

    expect((await fetchMemberNights('qui-sigui')).map((n) => n.event_id)).toEqual([COMI])
  })

  it('demana `abast` a la base, sense la qual el filtre és un no-op silenciós', async () => {
    await fetchMemberNights('qui-sigui')

    expect(selectDemanat).toContain('abast')
    // I el control positiu de la cadena: que no s'hagi quedat buida perquè el
    // doble no ha arribat a rebre cap `select`.
    expect(selectDemanat).toContain('starts_at')
  })
})
