import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/i18n'

/**
 * Els quatre blocs de `/soci/:id` quan la consulta peta.
 *
 * PER QUÈ EXISTEIX AQUEST FITXER. Els quatre blocs van néixer amb una sola
 * sortida per a «encara no ha arribat», «ha petat» i «no en té cap», i les
 * tres es llegien igual: un 500 de `member_badges()` treia el bloc i el soci
 * llegia «Encara no en té cap». Es va arreglar afegint una branca d'error a
 * cadascun, i l'arreglament no tenia cap prova a cap dels tres nivells —ni
 * pgTAP, ni RLS, ni unitària—: l'únic aval era haver-ho mirat. Una branca sense
 * prova és una branca que el primer refactor es menja sense que res ho digui,
 * i el que queda enrere és una frase falsa dita amb tota la confiança.
 *
 * PER QUÈ NO ES POT PROVAR MÉS AVALL. No és cap propietat de l'esquema: la base
 * fa exactament el mateix en tots dos casos —torna files o torna un error— i el
 * que es prova aquí és què en fa la pantalla. pgTAP no veu cap pantalla i la
 * suite d'RLS no en renderitza cap.
 *
 * CADA CAS ÉS UNA PARELLA, i la parella és tot el sentit del fitxer: de cada
 * bloc se'n comprova l'error I el buit de debò, perquè el defecte no era que
 * l'error no es veiés, era que no es distingia del buit. Una prova que només
 * mirés l'error seguiria verda el dia que la branca del buit tornés a
 * empassar-se les dues.
 *
 * LA XARXA ES TALLA A `@/lib/supabase`, que és el pis on de debò arriba un 500:
 * així la prova passa per `unwrapAs`, per `DbError` i per `errorKey`, que és la
 * cadena sencera que decideix quina frase es llegeix. Substituir les funcions
 * de `./api` provaria que React Query pinta el que li donen i prou.
 *
 * Gent i dades inventades, com a tot el repositori.
 */

interface Resposta {
  data: unknown
  error: { code: string; message: string; details: string; hint: string } | null
}

/** Per nom de taula o de funció: cada bloc demana una cosa diferent. */
const respostes = new Map<string, Resposta>()

const BUIT: Resposta = { data: [], error: null }

/** 42501 és el que una política que diu que no torna, i `errorKey` el sap. */
const PETA: Resposta = {
  data: null,
  error: { code: '42501', message: 'permission denied', details: '', hint: '' },
}

vi.mock('@/lib/supabase', () => {
  // El constructor de consultes encadena i al final és un thenable. Un Proxy
  // que es torna a si mateix per a qualsevol mètode val per a totes les
  // cadenes dels quatre blocs sense haver-les d'enumerar —`.select().order()`,
  // `.select().eq().eq()`— i sense trencar-se el dia que una en guanyi una
  // baula.
  const fabrica = (nom: string): unknown => {
    const p: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (onFulfilled: (r: Resposta) => unknown) =>
              Promise.resolve(respostes.get(nom) ?? BUIT).then(onFulfilled)
          }
          return () => p
        },
      },
    )
    return p
  }
  return {
    supabase: { from: (taula: string) => fabrica(taula), rpc: (nom: string) => fabrica(nom) },
    rpc: (nom: string) => Promise.resolve(respostes.get(nom) ?? BUIT),
  }
})

const { MemberStandingBlock } = await import('./MemberStandingBlock')
const { MemberStreakCard } = await import('./MemberStreakCard')
const { MemberBadgesBlock } = await import('./MemberBadgesBlock')
const { MemberNightsBlock } = await import('./MemberNightsBlock')

const SOCI = '00000000-0000-4000-8000-00000000fb01'

/**
 * Les frases s'agafen del catàleg i no s'escriuen aquí.
 *
 * El detector d'idioma mira `navigator`, que a jsdom diu anglès, i una prova
 * amb la frase catalana escrita a mà fallava per l'idioma i no pel que volia
 * dir. Es fixa la llengua per tenir una sortida estable, i el que s'espera es
 * demana per clau: així això prova que el bloc ensenya LA FRASE D'AQUELLA CLAU
 * —o sigui que `errorKey()` hi és pel mig— i no que algú hagi encertat a
 * copiar un text que demà es pot reescriure.
 */
const frase = (clau: string) => i18n.t(clau)

beforeAll(async () => {
  await i18n.changeLanguage('ca')
})

function pinta(node: ReactElement) {
  const client = new QueryClient({
    // Sense reintents: una prova que espera tres tandes de rebot triga el que
    // triguen els rebots i no prova res més.
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  respostes.clear()
  // React Query escriu l'error a la consola encara que el component el pinti.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('els punts i la posició', () => {
  it('diuen que han petat, i no que la persona s’amaga del rànquing', async () => {
    respostes.set('ranking_periods', PETA)

    pinta(<MemberStandingBlock userId={SOCI} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(frase('errors.forbidden'))
    expect(screen.queryByText(frase('member.standing.hidden'))).not.toBeInTheDocument()
  })

  it('i qui de debò s’amaga ho diu sense cap avís vermell', async () => {
    respostes.set('ranking_periods', BUIT)
    respostes.set('ranking_period', BUIT)

    pinta(<MemberStandingBlock userId={SOCI} />)

    expect(await screen.findByText(frase('member.standing.hidden'))).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('la ratxa', () => {
  it('diu que ha petat, i no un zero', async () => {
    respostes.set('member_streak', PETA)

    pinta(<MemberStreakCard userId={SOCI} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(frase('errors.forbidden'))
    expect(screen.queryByText(frase('member.streak.none'))).not.toBeInTheDocument()
  })

  it('i una ratxa de zero de debò és un zero sense avís', async () => {
    respostes.set('member_streak', { data: { actual: 0, millor: 0 }, error: null })

    pinta(<MemberStreakCard userId={SOCI} />)

    expect(await screen.findByText(frase('member.streak.none'))).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('les insígnies', () => {
  it('diuen que han petat, i no que no en té cap', async () => {
    respostes.set('member_badges', PETA)

    pinta(<MemberBadgesBlock userId={SOCI} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(frase('errors.forbidden'))
    expect(screen.queryByText(frase('member.badges.empty'))).not.toBeInTheDocument()
  })

  it('i qui de debò no en té cap ho llegeix sense cap avís', async () => {
    respostes.set('member_badges', BUIT)

    pinta(<MemberBadgesBlock userId={SOCI} />)

    expect(await screen.findByText(frase('member.badges.empty'))).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('les nits', () => {
  it('diuen que han petat, i no que no consta enlloc', async () => {
    respostes.set('attendances', PETA)

    pinta(<MemberNightsBlock userId={SOCI} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(frase('errors.forbidden'))
    expect(screen.queryByText(frase('member.nights.empty'))).not.toBeInTheDocument()
  })

  it('i qui de debò no consta enlloc ho llegeix sense cap avís', async () => {
    respostes.set('attendances', BUIT)

    pinta(<MemberNightsBlock userId={SOCI} />)

    expect(await screen.findByText(frase('member.nights.empty'))).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('els quatre alhora, que és com es veuen', () => {
  it('cap dels quatre es queda mut quan tot peta', async () => {
    for (const nom of [
      'ranking_periods',
      'ranking_period',
      'member_streak',
      'member_badges',
      'attendances',
    ])
      respostes.set(nom, PETA)

    pinta(
      <>
        <MemberStandingBlock userId={SOCI} />
        <MemberStreakCard userId={SOCI} />
        <MemberBadgesBlock userId={SOCI} />
        <MemberNightsBlock userId={SOCI} />
      </>,
    )

    await waitFor(() => {
      expect(screen.getAllByRole('alert')).toHaveLength(4)
    })
  })
})
