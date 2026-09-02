import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { BadgeStrip } from '@/features/badges/BadgeStrip'
import { clearFailedCheckins } from '@/features/checkin/failed'
import { forgetCachedTokens } from '@/features/qr/api'
import { periodBounds, rankingKeys } from '@/features/ranking/api'
import { fetchRanking } from '@/features/ranking/api'
import { defaultPeriod, usePeriods } from '@/features/ranking/useRanking'
import { isJunta, useMyProfile } from '@/features/session/useMyProfile'
import { useUserId } from '@/features/session/useUserId'
import { formatDayMonth, formatOrdinal } from '@/i18n/format'
import { SUPPORTED_LOCALES, toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import type { Escola } from '@/lib/model'
import { HERE, IDEAS, PROVES, SCANS, clearAllQueues, count } from '@/lib/queue'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/ui/Avatar/Avatar'

import { CameraIcon } from './icons'
import { StreakCard } from './StreakCard'
import {
  byMotive,
  fetchAttendedCount,
  fetchMyPoints,
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
const ROW = 'flex items-center gap-3 border-b border-surface-4 py-[15px]'

export function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const userId = useUserId()
  const client = useQueryClient()
  const { data: profile } = useMyProfile()

  const periods = usePeriods()
  const bounds = periodBounds(defaultPeriod(periods.data))
  const ranking = useQuery({
    queryKey: rankingKeys.individual(bounds),
    queryFn: () => fetchRanking(bounds),
    enabled: periods.isSuccess,
  })
  const points = useQuery({
    queryKey: profileScreenKeys.points(userId),
    queryFn: () => fetchMyPoints(userId),
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
  const hidden = profile?.hide_from_ranking === true

  const subtitle = [
    profile?.escola == null ? null : t(`escolaShort.${profile.escola satisfies Escola}`),
    profile?.curs == null ? null : t(`onboarding.year.${String(profile.curs)}`),
    profile?.created_at == null
      ? null
      : t('profile.memberSince', { year: new Date(profile.created_at).getFullYear() }),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')

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
    <main className="with-tabbar min-h-dvh bg-app pt-[var(--ds-safe-top-min)]">
      {/* El títol més gran de l'app i el que està més amunt de tot: sis
          píxels no eren coixí, eren una coincidència. */}
      <header className={`flex items-center gap-8 pt-6 ${GUTTER}`}>
        {/* La insígnia de càmera a sobre de la foto, que és on la gent la
            busca —i la fila d'Ajustos a sota, que és on es busca el nom. Dues
            entrades a la mateixa pantalla i no una tria: qui ve a canviar-se la
            cara no pensa «ajustos», i qui ve a corregir-se el nom no pensa
            «toca la foto». */}
        <Link
          to="/perfil/editar"
          aria-label={t('profile.photo.badge')}
          className="relative block flex-none no-underline"
        >
          <Avatar src={profile?.avatar_url ?? null} size={72} />
          <span
            aria-hidden="true"
            className="absolute -right-[2px] -bottom-[2px] grid size-[26px] place-items-center rounded-full border-2 border-app bg-brand-cta text-on-brand"
          >
            <CameraIcon size={13} />
          </span>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="display text-d-s tracking-[-0.045em] [text-wrap:balance]">
            {profile?.nombre ?? ''}
          </h1>
          {subtitle === '' ? null : (
            <p className="mt-[3px] text-md-lo font-semibold text-fg-muted">{subtitle}</p>
          )}
          {isJunta(profile) ? (
            <p className="mt-[6px] text-sm-lo font-bold text-brand-label">
              {t('profile.youAreJunta')}
            </p>
          ) : null}
        </div>
      </header>

      {/* Three numbers, equal weight, hairlines between. Anything with a
          bigger figure next to it stops being read. */}
      <section className="mt-8 grid grid-cols-3 border-y border-surface-7">
        <Stat value={me ? String(me.punts) : '—'} label={t('profile.stats.points')} />
        <Stat
          value={me ? formatOrdinal(me.posicio, locale) : '—'}
          label={t('profile.stats.position', { total: ranking.data?.length ?? 0 })}
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
                <p className="tabular flex-none text-xl font-extrabold text-success">
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
              <li key={row.id} className={ROW}>
                <p className="w-[52px] flex-none text-sm-lo font-semibold text-fg-dim">
                  {formatDayMonth(new Date(row.created_at), locale)}
                </p>
                <p className="min-w-0 flex-1 text-base [text-wrap:pretty]">
                  {/* El motiu quan no hi ha títol, i això inclou ara els
                      esdeveniments encara no revelats: «Venir» diu més que
                      «? ? ?» en una llista del que ja has fet. */}
                  {row.events?.event_title?.titulo ?? t(`motive.${row.motivo}`)}
                </p>
                <p className="tabular flex-none text-base font-extrabold text-success">
                  {row.puntos > 0 ? '+' : ''}
                  {row.puntos}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

        <Link to="/perfil/editar" className={`${ROW} no-underline`}>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-fg">
              {t('profile.settings.photo')}
            </span>
            <span className="mt-[3px] block text-sm-lo text-[var(--ds-text-muted-lo)]">
              {photoSub}
            </span>
          </span>
          <span aria-hidden="true" className="flex-none text-2xl text-brand-accent">
            ›
          </span>
        </Link>

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

        <Link to="/perfil/nits" className={`${ROW} no-underline`}>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-fg">
              {t('profile.settings.nights')}
            </span>
            <span className="mt-[3px] block text-sm-lo text-[var(--ds-text-muted-lo)]">
              {t('profile.settings.nightsSub')}
            </span>
          </span>
          <span aria-hidden="true" className="flex-none text-2xl text-brand-accent">
            ›
          </span>
        </Link>

        {isJunta(profile) ? (
          <Link to="/junta" className={`${ROW} no-underline`}>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-fg">
                {t('profile.settings.junta')}
              </span>
              <span className="mt-[3px] block text-sm-lo text-[var(--ds-text-muted-lo)]">
                {t('profile.settings.juntaSub')}
              </span>
            </span>
            <span aria-hidden="true" className="flex-none text-2xl text-brand-accent">
              ›
            </span>
          </Link>
        ) : null}

        {pending === null ? (
          <button
            type="button"
            onClick={() => void askSignOut()}
            className="cursor-pointer border-0 bg-transparent p-0 pt-9 pb-4 text-base font-bold text-warning"
          >
            {t('actions.signOut')}
          </button>
        ) : (
          <div className="pt-9 pb-4">
            <p className="text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
              {t('profile.signOutPending.warn', { count: pending })}
            </p>
            <div className="mt-5 flex gap-4">
              <button
                type="button"
                onClick={() => void signOut()}
                className="min-h-[46px] flex-1 border-[1.5px] border-warning px-5 text-md font-bold text-warning"
              >
                {t('profile.signOutPending.anyway')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPending(null)
                }}
                className="min-h-[46px] flex-none px-5 text-md font-bold text-fg-muted"
              >
                {t('profile.signOutPending.wait')}
              </button>
            </div>
          </div>
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
