import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useLocation, useParams } from 'react-router'

import { JuntaHeader } from '@/features/junta/JuntaHeader'
import { instagramUrl } from '@/features/profile/instagram'
import { fetchProfile, profileKeys } from '@/features/session/profile'
import { isJunta, useMyProfile } from '@/features/session/useMyProfile'
import { useUserId } from '@/features/session/useUserId'
import { errorKey } from '@/lib/errors'
import type { Escola } from '@/lib/model'
import { PersonHead, PersonHeadSkeleton } from '@/ui/PersonHead/PersonHead'
import { NavRow } from '@/ui/Row/Row'

import { MemberBadgesBlock } from './MemberBadgesBlock'
import { MemberNightsBlock } from './MemberNightsBlock'
import { MemberStandingBlock } from './MemberStandingBlock'
import { MemberStreakCard } from './MemberStreakCard'
import { readFrom } from './route'
import { memberSubtitle } from './subtitle'

/**
 * El perfil d'un altre soci.
 *
 * ES DIU `SociScreen` I NO `MemberScreen`, que seria el nom obvi: aquell ja
 * és la fitxa de junta d'un soci —el llibre major de punts, a
 * `/junta/socis/:id`— i dues pantalles amb el mateix nom dins de la mateixa
 * app és una trampa per a qui les cerqui i un error de compilació el dia que
 * totes dues entren a `App.tsx`. El nom d'aquesta és el de la seva ruta. La
 * capçalera que comparteixen no es diu com cap de les dues, pel mateix motiu:
 * és `ui/PersonHead`, i la pinta igual aquí, a `/perfil` i a la fitxa de la
 * junta. El que li canvia és el final de la línia de sota el nom, que arriba
 * fet des d'aquí.
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

// L'àrea segura de baix, com a les altres pantalles sense barra de pestanyes.
// La barra la posa allà on n'hi ha; aquí no n'hi ha cap, o sigui que l'última
// nit de la llista queda sota l'indicador d'inici d'un mòbil amb osca si ningú
// no ho reserva. Un `pb-10` pelat, que és el que hi havia, són 20px fixos: prou
// a l'ordinador i mig dit de menys al telèfon.
const SHELL = 'min-h-dvh bg-app pb-[calc(var(--ds-safe-bottom)+32px)]'

export function SociScreen() {
  const { t } = useTranslation()
  const { id } = useParams()
  const userId = id ?? ''
  const meId = useUserId()
  // Qui mira, no qui es mira: decideix si la porta cap al registre de punts hi
  // surt. És la mateixa clau que tota la resta de l'app, o sigui cache i cap
  // consulta nova.
  const { data: jo } = useMyProfile()
  // `location.state` és `any` per a TypeScript, i `readFrom` és precisament qui
  // el converteix en una cosa de la qual es pot dir alguna cosa.
  const back = readFrom(useLocation().state as unknown)

  // La mateixa clau que `useMyProfile`, a posta: obrir el teu propi perfil des
  // d'una llista no ha de tornar a demanar una fila que ja hi és.
  const profile = useQuery({
    queryKey: profileKeys.of(userId),
    queryFn: () => fetchProfile(userId),
    enabled: userId !== '',
  })

  const header = (
    <JuntaHeader to={back.from ?? '/ranquing'} label={back.fromLabel ?? t('nav.ranking')} />
  )

  if (profile.isPending) {
    return (
      <main className={SHELL}>
        {header}
        {/* La silueta de la capçalera, i no «Un segon…», que és el que hi havia.
            Viu al costat de la capçalera que imita —`ui/PersonHead`— perquè les
            mides han de ser les mateixes o la pantalla torna a saltar.
            No s'hi posa la d'un bloc: cada bloc ja duu la seva —vegeu
            `MemberStreakCard`— i dibuixar-les aquí voldria dir tenir-ne dues
            versions de cadascuna. */}
        <PersonHeadSkeleton className={`pt-6 ${GUTTER}`} />
      </main>
    )
  }

  if (profile.isError) {
    return (
      <main className={SHELL}>
        {header}
        <p
          role="alert"
          className={`pt-8 text-md font-bold text-error [text-wrap:pretty] ${GUTTER}`}
        >
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
      <main className={SHELL}>
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
    cua: t('profile.memberSince', { year: new Date(soci.created_at).getFullYear() }),
  })

  return (
    <main className={SHELL}>
      {header}

      <PersonHead
        src={soci.avatar_url}
        nombre={soci.nombre}
        subtitle={subtitle}
        /* Qui obre el seu propi perfil des d'una llista hi ha d'arribar i
           trobar-hi la porta de tornada al seu, que és on hi ha els botons.
           Sense això, la pantalla és una còpia muda i més pobra de la seva. */
        note={userId === meId ? t('member.isYou') : undefined}
        className={`pt-6 ${GUTTER}`}
      />

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
          Instagram tot sol; `instagram://` no faria res quan no hi és.
          `border-t` a part: la fila és la primera de la pantalla i sense ratlla
          de dalt queda enganxada al nom. */}
      {soci.instagram === null || soci.instagram === '' ? null : (
        <NavRow
          href={instagramUrl(soci.instagram)}
          title={t('member.instagram')}
          sub={`@${soci.instagram}`}
          truncate
          className={`mt-6 border-t border-surface-4 ${GUTTER}`}
        />
      )}

      <MemberStandingBlock userId={userId} />
      <MemberStreakCard userId={userId} />
      <MemberBadgesBlock userId={userId} />
      <MemberNightsBlock userId={userId} />

      {/* LA PORTA CAP A LA FITXA DE LA JUNTA, i només per a qui és de la junta.
          Les dues pantalles parlen de la mateixa persona i fins ara no
          s'enllaçaven en cap direcció: de la fitxa de la junta no es podia
          arribar al que veu tothom, i d'aquí no es podia arribar al registre de
          punts. Un admin que veu un nom al rànquing i vol corregir-li un +20
          havia de recordar que existeix `/junta/socis`, buscar-lo en una llista
          de quaranta i tornar a entrar.
          VA AL FINAL i no a dalt: aquesta pantalla és el perfil públic i ha de
          semblar-ho també per a qui té permisos. A dalt, el primer que llegiria
          un admin de qualsevol soci seria una porta cap a treure-li punts.
          I EL SUBTÍTOL DIU QUE ÉS PRIVADA. La fila només la veu la junta, però
          qui la veu ha de saber que la persona del nom no la veu: és la
          diferència entre «aquí hi ha més coses» i «aquí hi ha coses teves». */}
      {isJunta(jo) ? (
        <NavRow
          to={`/junta/socis/${userId}`}
          title={t('member.juntaSheet')}
          sub={t('member.juntaSheetSub')}
          className={`mt-12 border-t border-surface-4 ${GUTTER}`}
        />
      ) : null}

      {/* Només al teu. «Això és el que qualsevol soci veu de tu» sota el perfil
          d'una altra persona és una frase que parla de tu en una pantalla que
          no va de tu, i on val la pena dir-la és precisament quan t'hi trobes:
          és l'única manera de saber què se'n veu sense demanar-ho a ningú. */}
      {userId === meId ? (
        <p className={`pt-12 text-sm-lo text-fg-muted-lo [text-wrap:pretty] ${GUTTER}`}>
          {t('member.footer')}
        </p>
      ) : null}
    </main>
  )
}
