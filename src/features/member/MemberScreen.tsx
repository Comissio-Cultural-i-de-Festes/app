import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useLocation, useParams } from 'react-router'

import { JuntaHeader } from '@/features/junta/JuntaHeader'
import { instagramUrl } from '@/features/profile/instagram'
import { fetchProfile, profileKeys } from '@/features/session/profile'
import { useUserId } from '@/features/session/useUserId'
import { errorKey } from '@/lib/errors'
import type { Escola } from '@/lib/model'
import { Avatar } from '@/ui/Avatar/Avatar'

import { MemberBadgesBlock } from './MemberBadgesBlock'
import { MemberNightsBlock } from './MemberNightsBlock'
import { MemberStandingBlock } from './MemberStandingBlock'
import { MemberStreakCard } from './MemberStreakCard'
import { readFrom } from './route'
import { memberSubtitle } from './subtitle'

/**
 * El perfil d'un altre soci.
 *
 * PER QUÈ EXISTEIX. L'app ensenya la cara i el nom d'altra gent a cinc llocs
 * —el rànquing, qui hi ha dins, els cotxes, les idees, la tira d'insígnies— i
 * fins ara cap d'aquells noms portava enlloc. Es veia una cara i d'aquella
 * persona no es podia saber res més. Qui porta anys a la comi es coneix; qui hi
 * entra al setembre es passa el primer trimestre posant noms a cares.
 *
 * SENSE BARRA DE PESTANYES, com la pantalla de la gimcana o la galeria d'una
 * festa: és un lloc on s'entra i d'on es torna a sortir. Per això la fletxa de
 * la capçalera és l'única sortida i per això ha de portar el nom del lloc d'on
 * s'ha vingut, cosa que l'enllaç deixa dita a `location.state` —vegeu
 * `route.ts`. Sense res dit, la tornada és el Rànquing, que és la llista de
 * gent més gran que hi ha.
 *
 * CADA BLOC ES DEMANA LES SEVES DADES i entra aquí en una línia, com al perfil
 * propi. Això no és estètica: la posició al rànquing és una crida que qui ve del
 * Rànquing ja té a la memòria, les insígnies són una RPC i les nits una
 * consulta a `attendances`, i tenir-les totes en aquest fitxer voldria dir que
 * la pantalla no ensenya res fins que la més lenta ha contestat.
 *
 * QUI JA NO HI ÉS NO TÉ PERFIL. `profiles_select_directory` només publica
 * `estat = 'actiu'`, o sigui que per a un soci la fila directament no arriba;
 * per a algú de la junta sí, perquè té una política pròpia. Es mira `estat` i
 * no només si la fila hi és: així la pantalla diu el mateix a tothom, en comptes
 * de dir-li a la junta una cosa que els socis no veuen.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function MemberScreen() {
  const { t } = useTranslation()
  const { id } = useParams()
  const userId = id ?? ''
  const meId = useUserId()
  // `location.state` és `any` per a TypeScript, i `readFrom` és precisament qui
  // el converteix en una cosa de la qual es pot dir alguna cosa.
  const back = readFrom(useLocation().state as unknown)

  // La mateixa clau que `useMyProfile`, a posta: obrir el teu propi perfil des
  // d'una llista no ha de tornar a demanar una fila que ja hi és.
  const profile = useQuery({
    queryKey: profileKeys.me(userId),
    queryFn: () => fetchProfile(userId),
    enabled: userId !== '',
  })

  const header = (
    <JuntaHeader to={back.from ?? '/ranquing'} label={back.fromLabel ?? t('nav.ranking')} />
  )

  if (profile.isPending) {
    return (
      <main className="min-h-dvh bg-app">
        {header}
        <p className={`pt-8 text-fg-muted ${GUTTER}`}>{t('state.loading')}</p>
      </main>
    )
  }

  if (profile.isError) {
    return (
      <main className="min-h-dvh bg-app">
        {header}
        <p role="alert" className={`pt-8 text-md font-bold text-error [text-wrap:pretty] ${GUTTER}`}>
          {t(errorKey(profile.error))}
        </p>
      </main>
    )
  }

  const soci = profile.data

  // Ni la fila ni un soci en actiu. Ho ha de dir en comptes de quedar-se
  // carregant per sempre, que és el que passava amb un `?.` a cada camp: una
  // pantalla amb el nom buit i quatre blocs que no arriben mai.
  if (soci?.estat !== 'actiu') {
    return (
      <main className="min-h-dvh bg-app">
        {header}
        <div className={`pt-8 ${GUTTER}`}>
          <h1 className="display text-d-s tracking-[-0.045em] [text-wrap:balance]">
            {t('member.gone.title')}
          </h1>
          <p className="mt-5 text-md text-fg-muted [text-wrap:pretty]">{t('member.gone.body')}</p>
        </div>
      </main>
    )
  }

  const subtitle = memberSubtitle({
    escola: soci.escola === null ? null : t(`escolaShort.${soci.escola satisfies Escola}`),
    curs: soci.curs === null ? null : t(`onboarding.year.${String(soci.curs)}`),
    grau: soci.grau,
    desDe: t('profile.memberSince', { year: new Date(soci.created_at).getFullYear() }),
  })

  return (
    <main className="min-h-dvh bg-app">
      {header}

      <header className={`flex items-center gap-8 pt-6 ${GUTTER}`}>
        <Avatar src={soci.avatar_url} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="display text-d-s tracking-[-0.045em] [text-wrap:balance]">{soci.nombre}</h1>
          {subtitle === '' ? null : (
            <p className="mt-[3px] text-md-lo font-semibold text-fg-muted">{subtitle}</p>
          )}
          {/* Qui obre el seu propi perfil des d'una llista hi ha d'arribar i
              trobar-hi la porta de tornada al seu, que és on hi ha els botons.
              Sense això, la pantalla és una còpia muda i més pobra de la seva. */}
          {userId === meId ? (
            <p className="mt-[6px] text-sm-lo font-bold text-brand-label">{t('member.isYou')}</p>
          ) : null}
        </div>
      </header>

      {/* L'Instagram, que és l'altra meitat de la columna que va arribar amb la
          migració 70: es podia omplir i no el veia ningú, perquè aquest era
          l'únic lloc on té sentit ensenyar el d'una altra persona.
          SENSE FILA QUAN NO N'HI HA, i tampoc l'espai que ocuparia: la columna
          és opcional a posta i buit vol dir «no el vull publicar», no «encara
          no l'he posat». Una fila grisa que digui que no en té convertiria una
          decisió en una absència.
          L'URL la fa `instagramUrl()` i no aquesta pantalla. El que es desa és
          el nom d'usuari sol —ho garanteix el CHECK de la 70— i tenir un sol
          lloc que el converteix en enllaç és el que fa que no hi hagi res a
          injectar. Al mòbil amb l'app instal·lada, aquesta adreça l'obre
          Instagram tot sol; `instagram://` no faria res quan no hi és. */}
      {soci.instagram === null || soci.instagram === '' ? null : (
        <a
          href={instagramUrl(soci.instagram)}
          target="_blank"
          rel="noreferrer"
          className={`mt-6 flex items-center gap-3 border-y border-surface-4 py-[15px] no-underline ${GUTTER}`}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-fg">{t('member.instagram')}</span>
            <span className="mt-[3px] block truncate text-sm-lo text-[var(--ds-text-muted-lo)]">
              {`@${soci.instagram}`}
            </span>
          </span>
          <span aria-hidden="true" className="flex-none text-2xl text-brand-accent">
            ›
          </span>
        </a>
      )}

      <MemberStandingBlock userId={userId} />
      <MemberStreakCard userId={userId} />
      <MemberBadgesBlock userId={userId} />
      <MemberNightsBlock userId={userId} />

      {/* Només al teu. «Això és el que qualsevol soci veu de tu» sota el perfil
          d'una altra persona és una frase que parla de tu en una pantalla que
          no va de tu, i on val la pena dir-la és precisament quan t'hi trobes:
          és l'única manera de saber què se'n veu sense demanar-ho a ningú. */}
      {userId === meId ? (
        <p className={`pt-12 pb-10 text-sm-lo text-fg-muted-lo [text-wrap:pretty] ${GUTTER}`}>
          {t('member.footer')}
        </p>
      ) : (
        <div className="pb-10" />
      )}
    </main>
  )
}
