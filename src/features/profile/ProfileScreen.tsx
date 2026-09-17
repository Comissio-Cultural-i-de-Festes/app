import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { PRIVACY_PATH, TERMS_PATH } from '@/App'
import { BadgeStrip } from '@/features/badges/BadgeStrip'
import { clearFailedCheckins } from '@/features/checkin/failed'
import { memberSubtitle } from '@/features/member/subtitle'
import { forgetCachedTokens } from '@/features/qr/api'
import { periodBounds, rankingKeys } from '@/features/ranking/api'
import { fetchRanking } from '@/features/ranking/api'
import { defaultPeriod, usePeriods } from '@/features/ranking/useRanking'
import { isJunta, useMyProfile } from '@/features/session/useMyProfile'
import { useUserId } from '@/features/session/useUserId'
import { formatOrdinal } from '@/i18n/format'
import { SUPPORTED_LOCALES, toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import type { Escola } from '@/lib/model'
import { HERE, IDEAS, PROVES, SCANS, clearAllQueues, count } from '@/lib/queue'
import { Confirm } from '@/ui/Confirm/Confirm'
import { PERSON_AVATAR, PersonHead, PersonHeadSkeleton } from '@/ui/PersonHead/PersonHead'
import { NavRow, ROW } from '@/ui/Row/Row'
import { SafeTop } from '@/ui/SafeTop/SafeTop'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/ui/Avatar/Avatar'

import { AvisosCard } from './AvisosCard'
import { CameraIcon } from './icons'
import { puntsColor } from './ledger'
import { LedgerRow } from './LedgerRow'
import { MyCalendarRow } from './MyCalendarRow'
import { HoresCard } from './HoresCard'
import { StreakCard } from './StreakCard'
import {
  byMotive,
  fetchAttendedCount,
  fetchPointsOf,
  profileScreenKeys,
  setHideFromRanking,
} from './api'

/**
 * Your own page.
 *
 * The brief asks for one thing above the rest: where the points came from,
 * broken down. A total on its own is a score; a breakdown is a record of what
 * you did, and it is the difference between a leaderboard and a reason to help
 * carry the speakers again.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const userId = useUserId()
  const client = useQueryClient()
  const { data: profile, isPending: profilePending } = useMyProfile()

  const periods = usePeriods()
  const bounds = periodBounds(defaultPeriod(periods.data))
  const ranking = useQuery({
    queryKey: rankingKeys.individual(bounds),
    queryFn: () => fetchRanking(bounds),
    enabled: periods.isSuccess,
  })
  const points = useQuery({
    queryKey: profileScreenKeys.points(userId),
    queryFn: () => fetchPointsOf(userId),
  })
  const attended = useQuery({
    queryKey: profileScreenKeys.attended(userId),
    queryFn: () => fetchAttendedCount(userId),
  })

  const hide = useMutation({
    mutationFn: (hidden: boolean) => setHideFromRanking(userId, hidden),
    onSuccess: async () => {
      await client.invalidateQueries()
    },
  })

  const me = ranking.data?.find((r) => r.user_id === userId) ?? null
  const totals = byMotive(points.data ?? [])
  // El que has fet, independentment que surtis al rànquing o no.
  const myPoints = totals.reduce((sum, row) => sum + row.punts, 0)
  const hidden = profile?.hide_from_ranking === true

  // Sense grau: el teu perfil ja té «La teva foto i el teu nom» a sota, i qui
  // vulgui veure com el veuen els altres hi té el seu propi full a `/soci/:id`,
  // que sí que el porta.
  const subtitle = memberSubtitle({
    escola: profile?.escola == null ? null : t(`escolaShort.${profile.escola satisfies Escola}`),
    curs: profile?.curs == null ? null : t(`onboarding.year.${String(profile.curs)}`),
    grau: null,
    cua:
      profile?.created_at == null
        ? null
        : t('profile.memberSince', { year: new Date(profile.created_at).getFullYear() }),
  })

  // Quantes coses esperen xarxa, o `null` mentre no s'ha preguntat.
  const [pending, setPending] = useState<number | null>(null)

  // `signOut()` buida les quatre cues a posta —el telèfon es comparteix— però
  // fer-ho sense dir-ho vol dir que els punts d'aquella nit s'evaporen amb un
  // toc. Es compta abans, i només si hi ha res es demana confirmació: el cas
  // normal és cua buida i un sol toc, com fins ara.
  async function askSignOut(): Promise<void> {
    const counts = await Promise.all([SCANS, IDEAS, HERE, PROVES].map((store) => count(store)))
    const total = counts.reduce((sum, n) => sum + n, 0)
    if (total === 0) {
      await signOut()
      return
    }
    setPending(total)
  }

  async function signOut(): Promise<void> {
    // Before the session goes, not after: once it is gone this component is
    // unmounted and nothing is left to run the cleanup.
    forgetCachedTokens()
    // I les cues. Un fitxatge, una idea o una prova de gimcana que esperen
    // s'atribueixen a qui hi hagi la sessió quan surtin, no a qui les va fer:
    // en un telèfon compartit això vol dir fitxar algú altre a nom teu.
    await clearAllQueues()
    // I l'avís d'un fitxatge refusat, pel mateix motiu: diu on eres i quin dia.
    clearFailedCheckins()
    await supabase.auth.signOut()
  }

  // Què diu la fila d'Ajustos, que és tres coses diferents: la de Google, una
  // que ha pujat ella, o les ratlles. Dir «la del Google» a qui s'acaba de
  // penjar una foto seva seria mentida, i és l'únic lloc de la pantalla on es
  // pot saber.
  const photoSub =
    profile?.avatar_url == null
      ? t('profile.settings.photoSubNone')
      : profile.avatar_url.startsWith('http')
        ? t('profile.settings.photoSubGoogle')
        : t('profile.settings.photoSubOwn')

  return (
    <main className="with-tabbar min-h-dvh bg-app">
      <SafeTop />
      {/* El títol més gran de l'app i el que està més amunt de tot: sis
          píxels no eren coixí, eren una coincidència.
          I MENTRE LA FILA NO ARRIBA, LA SEVA SILUETA. Amb `?? ''` la capçalera
          es dibuixava amb el nom buit i la línia de sota absent, o sigui 72px
          de cara amb un forat al costat, i el nom hi queia després. És la
          mateixa silueta que `/soci/:id` i la fitxa de la junta, que és el que
          fa que els tres perfils es carreguin igual. */}
      {profilePending ? (
        <PersonHeadSkeleton className={`pt-6 ${GUTTER}`} />
      ) : (
        <PersonHead
          nombre={profile?.nombre ?? ''}
          subtitle={subtitle}
          note={isJunta(profile) ? t('profile.youAreJunta') : undefined}
          className={`pt-6 ${GUTTER}`}
          avatar={
            /* La insígnia de càmera a sobre de la foto, que és on la gent la
             busca —i la fila d'Ajustos a sota, que és on es busca el nom. Dues
             entrades a la mateixa pantalla i no una tria: qui ve a canviar-se la
             cara no pensa «ajustos», i qui ve a corregir-se el nom no pensa
             «toca la foto». És l'únic dels tres perfils on la cara porta enlloc,
             i per això la capçalera compartida rep la ranura sencera en comptes
             d'un booleà: així la mida és la mateixa i la porta és només d'aquí. */
            <Link
              to="/perfil/editar"
              aria-label={t('profile.photo.badge')}
              className="relative block flex-none no-underline"
            >
              <Avatar src={profile?.avatar_url ?? null} size={PERSON_AVATAR} />
              <span
                aria-hidden="true"
                className="absolute -right-[2px] -bottom-[2px] grid size-[26px] place-items-center rounded-full border-2 border-app bg-brand-cta text-on-brand"
              >
                <CameraIcon size={13} />
              </span>
            </Link>
          }
        />
      )}

      {/* Three numbers, equal weight, hairlines between. Anything with a
          bigger figure next to it stops being read. */}
      <section className="mt-8 grid grid-cols-3 border-y border-surface-7">
        {/* Zero punts és un valor CONEGUT, no un desconegut. Abans tots dos
            números eren un guionet quan `me` era null —perquè t'has amagat del
            rànquing, o perquè encara carrega— i el perfil deia «— de 0»
            mentre l'Inici deia «vas 1r de 7» de la mateixa persona. Els punts
            surten del registre, que és teu passi el que passi al rànquing; la
            posició no existeix si no hi surts, i aleshores tampoc no hi ha cap
            «de N» a dir. */}
        <Stat value={String(me?.punts ?? myPoints)} label={t('profile.stats.points')} />
        <Stat
          value={me ? formatOrdinal(me.posicio, locale) : '—'}
          label={
            me
              ? t('profile.stats.position', { total: ranking.data?.length ?? 0 })
              : t('profile.stats.positionUnknown')
          }
          divided
        />
        <Stat value={String(attended.data ?? 0)} label={t('profile.stats.attended')} divided />
      </section>

      {/* La ratxa i les insígnies van entre els números i el registre de punts,
          i en aquest ordre: totes dues diuen com estàs ara, i el que ve a sota
          és el que has fet. Es busquen les seves pròpies dades i entren aquí en
          una línia, com l'ExitPhotoCard i el MyNightBlock. */}
      <StreakCard />
      <BadgeStrip />
      {/* I les hores just després, ja dins de la meitat de baix: la seva llista
          queda a sobre de la dels punts i amb la mateixa forma de fila. */}
      <HoresCard />

      <section className={`pt-12 ${GUTTER}`}>
        <h2 className="eyebrow text-fg-muted">{t('profile.breakdown.title')}</h2>

        {points.isPending ? (
          // La forma real: tres motius amb la seva xifra a la dreta.
          <Skeleton className="mt-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className={ROW}>
                <div className="min-w-0 flex-1">
                  <SkeletonBar w="w-[55%]" h="h-[14px]" />
                  <SkeletonBar w="w-[30%]" h="h-[11px]" className="mt-[5px]" />
                </div>
                <SkeletonBar w="w-[34px]" h="h-[17px]" className="flex-none" />
              </div>
            ))}
          </Skeleton>
        ) : totals.length === 0 ? (
          <p className="py-8 text-md text-fg-muted [text-wrap:pretty]">
            {t('profile.breakdown.empty')}
          </p>
        ) : (
          <ul className="mt-2">
            {totals.map((row) => (
              <li key={row.motivo} className={ROW}>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold">{t(`motive.${row.motivo}`)}</p>
                  <p className="mt-[3px] text-sm-lo text-[var(--ds-text-muted-lo)]">
                    {t('profile.breakdown.times', { count: row.vegades })}
                  </p>
                </div>
                {/* El color el decideix el signe, com a la llista de sota i
                    com al llibre major de la junta. Aquí hi havia un
                    `text-success` fix, i des que `manual` i `avis` són motius
                    del llibre major un total per motiu pot quedar en negatiu:
                    «Avís · 1 vegada · −25» es pintava en verd d'encert. */}
                <p className={`tabular flex-none text-xl font-extrabold ${puntsColor(row.punts)}`}>
                  {row.punts > 0 ? '+' : ''}
                  {row.punts}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {points.data && points.data.length > 0 ? (
        <section className={`pt-6 ${GUTTER}`}>
          <h2 className="eyebrow text-fg-muted">{t('profile.history.title')}</h2>
          <ul className="mt-2">
            {points.data.slice(0, 6).map((row) => (
              <LedgerRow key={row.id} row={row} />
            ))}
          </ul>
        </section>
      ) : null}

      {/* I just sota el registre, els avisos. En aquest ordre perquè la fila
          «Avís −25» del registre és el que fa venir aquí: la targeta és qui diu
          de què era, quant pesava i si s'ha retirat. Es busca les seves pròpies
          dades i no surt gens quan no n'hi ha cap. */}
      <AvisosCard userId={userId} />

      <section className={`pt-12 pb-8 ${GUTTER}`}>
        <h2 className="eyebrow text-fg-muted">{t('profile.settings.title')}</h2>

        <button
          type="button"
          role="switch"
          aria-checked={!hidden}
          disabled={hide.isPending}
          onClick={() => {
            hide.mutate(!hidden)
          }}
          className={`${ROW} w-full text-left`}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">{t('profile.settings.public')}</span>
            <span className="mt-[3px] block text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
              {hidden ? t('profile.settings.publicOff') : t('profile.settings.publicOn')}
            </span>
          </span>
          <span
            aria-hidden="true"
            className={
              'flex h-[28px] w-[48px] flex-none items-center rounded-full p-[3px] ' +
              (hidden ? 'bg-surface-6' : 'bg-brand')
            }
          >
            <span
              className={
                'size-[22px] rounded-full bg-on-brand transition-transform ' +
                (hidden ? '' : 'translate-x-[20px]')
              }
            />
          </span>
        </button>

        {/* A privacy setting that looks saved and was not is the worst kind of
            silent failure: the toggle springs back on the next render and
            nothing says why. */}
        {hide.isError ? (
          <p role="alert" className="pt-4 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(hide.error))}
          </p>
        ) : null}

        <NavRow to="/perfil/editar" title={t('profile.settings.photo')} sub={photoSub} />

        {/* Una fila pròpia i no una menció a la de dalt: qui ja hi era no
            tornarà a passar per l'alta, i la columna li neix buida. Sense
            aquesta línia, una funció que existeix perquè et trobin viuria
            amagada dins d'una pantalla que es diu «la teva foto i el teu nom».
            Hi és sempre i el que canvia és el subtítol, com la de la foto. */}
        <NavRow
          to="/perfil/editar"
          title={t('profile.settings.instagram')}
          sub={
            profile?.instagram == null || profile.instagram === ''
              ? t('profile.settings.instagramNone')
              : `@${profile.instagram}`
          }
          truncate
        />

        <div className={ROW}>
          <span className="flex-1 text-base font-semibold">{t('language.label')}</span>
          <div className="flex gap-2">
            {SUPPORTED_LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={code === locale}
                onClick={() => {
                  void i18n.changeLanguage(code)
                }}
                className={
                  'min-h-[44px] rounded-chip px-4 text-sm font-bold ' +
                  (code === locale
                    ? 'bg-brand-cta text-on-brand'
                    : 'border border-border-strong text-fg-secondary')
                }
              >
                {t(`language.${code}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Es filtra ella sola: sense res a què hagis dit que sí, no hi surt. */}
        <MyCalendarRow />

        <NavRow
          to="/perfil/nits"
          title={t('profile.settings.nights')}
          sub={t('profile.settings.nightsSub')}
        />

        {isJunta(profile) ? (
          <NavRow
            to="/junta"
            title={t('profile.settings.junta')}
            sub={t('profile.settings.juntaSub')}
          />
        ) : null}

        {/* Aquí a baix i no a la capçalera: al perfil s'hi arriba quan ja s'ha
            entrat, i qui vulgui llegir-ho abans de donar res ho té a la porta i
            a l'alta. Aquestes dues files són perquè es pugui rellegir. */}
        <NavRow to={PRIVACY_PATH} title={t('legal.privacy')} sub={t('legal.privacySub')} />

        <NavRow to={TERMS_PATH} title={t('legal.terms')} sub={t('legal.termsSub')} />

        {pending === null ? (
          <button
            type="button"
            onClick={() => void askSignOut()}
            className="cursor-pointer border-0 bg-transparent p-0 pt-9 pb-4 text-base font-bold text-warning"
          >
            {t('actions.signOut')}
          </button>
        ) : (
          // El mateix panell que la baixa d'un soci i la retirada d'un avís:
          // s'obre on s'era, no atrapa el focus i el botó de fugir fa la mateixa
          // alçada que el de fer. Abans eren dos botons de 46px escrits a mà.
          <Confirm
            className="pt-9 pb-4"
            cta={t('profile.signOutPending.anyway')}
            cancel={t('profile.signOutPending.wait')}
            onConfirm={() => void signOut()}
            onCancel={() => {
              setPending(null)
            }}
          >
            <p className="text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
              {t('profile.signOutPending.warn', { count: pending })}
            </p>
          </Confirm>
        )}

        <p className="pb-6 text-sm-lo text-fg-muted-lo [text-wrap:pretty]">{t('profile.footer')}</p>
      </section>
    </main>
  )
}

function Stat({
  value,
  label,
  divided = false,
}: {
  readonly value: string
  readonly label: string
  readonly divided?: boolean
}) {
  return (
    <div className={`px-10 py-8 ${divided ? 'border-l border-surface-7' : ''}`}>
      <p className="tabular display text-d-md tracking-[-0.045em]">{value}</p>
      <p className="mt-[3px] text-2xs font-bold tracking-[0.06em] text-fg-dim uppercase">{label}</p>
    </div>
  )
}
