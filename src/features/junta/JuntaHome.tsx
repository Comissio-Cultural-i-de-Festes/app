import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { warmDecoder } from '@/features/door/decoder'
import { horizonIso } from '@/features/home/api'
import { fetchPeriods, rankingKeys } from '@/features/ranking/api'
import { useMyProfile } from '@/features/session/useMyProfile'
import { formatDateLong, formatDayNumber, formatMonthShort, formatWeekdayLong } from '@/i18n/format'
import { type Locale, toLocale } from '@/i18n/locales'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { fetchJuntaEvents, juntaEventKeys } from './eventsApi'
import { type DoorNow, fetchJuntaHome, juntaHomeKeys, placesLeft } from './homeApi'
import { JuntaHeader } from './JuntaHeader'

/**
 * The junta's front door.
 *
 * Three rules from the design, and each one is a decision rather than a
 * layout:
 *
 *   The navigation never waits. Loading and failure both leave every row
 *   drawn and tappable, because somebody who knows they are going to the
 *   invitations screen should not be held up by a count they did not ask for.
 *
 *   Empty means empty. "Nothing on these days" and "we could not find out"
 *   are different sentences, because one of them means do not trust this
 *   screen and the other does not.
 *
 *   Amber is for things that want doing, including "try again". The brand red
 *   never warns — it is the association's colour, and the door is the reason
 *   that rule exists.
 */

const GUTTER = 'px-[var(--ds-gutter)]'
const ROW =
  'flex min-h-[62px] items-center gap-4 border-t border-surface-4 py-6 no-underline ' +
  `text-left w-full ${GUTTER}`

export function JuntaHome() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const { data: profile } = useMyProfile()

  const home = useQuery({ queryKey: juntaHomeKeys.home(), queryFn: fetchJuntaHome })

  const horizon = horizonIso()
  const events = useQuery({
    queryKey: juntaEventKeys.list(horizon),
    queryFn: () => fetchJuntaEvents(horizon),
  })

  // La fila d'esborranys portava a /junta, que és aquesta mateixa pantalla:
  // tocar-la no feia res. La llista que ja tenim porta el flag, així que no cal
  // cap consulta nova. Amb reserva a /junta perquè aquesta llista està limitada
  // a l'horitzó i a vint files mentre que el recompte els compta tots: no
  // sempre hi ha d'haver-hi el primer esborrany.
  const firstDraft = events.data?.find((e) => !e.published)

  // Cached for half an hour and shared with the ranking, so this costs nothing
  // most of the time. It is here for one line: whether the terms still cover
  // today, which is the one configuration mistake nobody notices.
  const periods = useQuery({ queryKey: rankingKeys.periods(), queryFn: fetchPeriods })

  // Fetched here rather than at the door: this screen is opened on the way to
  // the venue, and the scanner is opened inside it, where there is no signal.
  useEffect(() => {
    if (navigator.onLine) void warmDecoder()
  }, [])

  const porta = home.data?.porta ?? null
  const dayWord = porta === null ? '' : formatWeekdayLong(new Date(porta.starts_at), locale)

  return (
    <main className="min-h-dvh bg-app pb-[calc(var(--ds-safe-bottom)+24px)]">
      <JuntaHeader to="/perfil" label={t('nav.profile')} title={t('junta.title')} />

      {home.isPending ? (
        <DoorLoading />
      ) : home.isError ? (
        <DoorFailed onRetry={() => void home.refetch()} />
      ) : porta === null ? (
        <DoorNone />
      ) : (
        <Door porta={porta} locale={locale} />
      )}

      {/* ── Hi ha feina ── */}
      <Heading
        title={t('junta.home.work')}
        aside={
          home.data === undefined
            ? undefined
            : t('junta.home.workCount', { count: workCount(home.data, porta) })
        }
        amber
      />

      {home.isPending ? (
        <WorkSkeleton />
      ) : home.isError ? (
        <div className={`flex items-center gap-6 pt-6 ${GUTTER}`}>
          <span className="display flex-none text-[34px] leading-none text-fg-muted">—</span>
          <p className="flex-1 text-md text-fg-secondary [text-wrap:pretty]">
            {t('junta.home.workFailed')}
          </p>
          <button
            type="button"
            onClick={() => void home.refetch()}
            className="min-h-[44px] flex-none border-[1.5px] border-[var(--ds-warning)] px-4 text-sm font-bold text-[var(--ds-warning)]"
          >
            {t('actions.retry')}
          </button>
        </div>
      ) : workCount(home.data, porta) === 0 ? (
        <div className={`pt-6 ${GUTTER}`}>
          <p className="text-md font-bold">{t('junta.home.workNone')}</p>
          <p className="mt-2 text-sm text-fg-muted [text-wrap:pretty]">
            {t('junta.home.workNoneSub')}
          </p>
        </div>
      ) : (
        <div className="mt-6">
          {home.data.pendents === 0 ? null : (
            <Count
              to="/junta/invitacions"
              n={home.data.pendents}
              title={t('junta.home.pending', { count: home.data.pendents })}
              sub={t('junta.home.pendingSub')}
            />
          )}
          {porta === null || porta.esperen === 0 ? null : (
            <Count
              to={`/junta/pagaments/${porta.id}`}
              n={porta.esperen}
              title={t('junta.home.waiting', { count: porta.esperen, event: dayWord })}
              sub={t('junta.home.waitingSub')}
            />
          )}
          {porta === null || porta.no_pagats === 0 ? null : (
            <Count
              to={`/junta/pagaments/${porta.id}`}
              n={porta.no_pagats}
              title={t('junta.home.unpaid', { count: porta.no_pagats, event: dayWord })}
              sub={t('junta.home.unpaidSub', { total: porta.diuen_si })}
            />
          )}
          {home.data.esborranys === 0 ? null : (
            <Count
              to={firstDraft === undefined ? '/junta' : `/junta/esdeveniment/${firstDraft.id}`}
              n={home.data.esborranys}
              title={t('junta.home.drafts', { count: home.data.esborranys })}
              sub={t('junta.home.draftsSub')}
            />
          )}
        </div>
      )}

      {/* ── El que passa ara ── */}
      <Heading title={t('junta.home.now')} />
      <div className="mt-6">
        <Row
          to="/junta/esdeveniment/nou"
          title={t('junta.newEvent')}
          sub={t('junta.newEventSub')}
        />
        <Row
          to="/junta/invitacions"
          title={t('junta.invites.title')}
          sub={t('junta.invitesSub')}
          badge={home.data?.pendents}
        />
        <Row
          to="/junta/pagaments"
          title={t('junta.payments.title')}
          sub={t('junta.paymentsSub')}
          badge={porta?.no_pagats}
        />
        <Row
          to="/junta/socis"
          title={t('junta.members.title')}
          // "0 persones" while the count is unknown would be a number the
          // screen made up. Without it the row still says what it is for.
          sub={
            home.data === undefined
              ? t('junta.members.rowSubPlain')
              : t('junta.members.rowSub', { count: home.data.socis })
          }
        />
        <Row to="/junta/idees" title={t('ideas.juntaTitle')} sub={t('junta.home.proposalsSub')} />
        <Row
          to="/junta/tauler"
          title={t('junta.dashboard.title')}
          sub={t('junta.dashboard.rowSub')}
        />
        <Row to="/junta/fotos" title={t('junta.photos.title')} sub={t('junta.photos.rowSub')} />
      </div>

      {/* ── Els que venen ── */}
      <Heading
        display
        title={t('junta.home.soon')}
        aside={
          events.data === undefined
            ? undefined
            : t('junta.home.soonCount', { count: events.data.length })
        }
      />
      {events.isPending ? (
        <CalendarSkeleton />
      ) : events.isError ? (
        <div className={`pt-6 ${GUTTER}`}>
          <p role="alert" className="text-md font-bold text-[var(--ds-warning)] [text-wrap:pretty]">
            {t('junta.home.soonFailed')}
          </p>
          <p className="mt-2 text-sm text-fg-muted [text-wrap:pretty]">
            {t('junta.home.soonFailedSub')}
          </p>
          <button
            type="button"
            onClick={() => void events.refetch()}
            className="mt-5 min-h-[46px] border-[1.5px] border-[var(--ds-warning)] px-5 text-md font-bold text-[var(--ds-warning)]"
          >
            {t('actions.retry')}
          </button>
        </div>
      ) : events.data.length === 0 ? (
        <div className={`pt-6 ${GUTTER}`}>
          <p className="text-md text-fg-muted [text-wrap:pretty]">{t('junta.home.soonEmpty')}</p>
          <Link
            to="/junta/esdeveniment/nou"
            className="mt-5 inline-flex min-h-[46px] items-center border-[1.5px] border-surface-7 px-5 text-md font-bold text-fg-secondary no-underline"
          >
            {t('junta.home.soonFirst')}
          </Link>
        </div>
      ) : (
        <div className="mt-6">
          {events.data.map((e) => (
            <Link key={e.id} to={`/junta/esdeveniment/${e.id}`} className={ROW}>
              <span className="w-[42px] flex-none text-center">
                <span className="eyebrow block text-[var(--ds-text-muted-lo)]">
                  {formatMonthShort(new Date(e.starts_at), locale).replace('.', '')}
                </span>
                <span className="display mt-[1px] block text-d-sm leading-none tracking-[-0.05em] text-fg">
                  {formatDayNumber(new Date(e.starts_at), locale)}
                </span>
              </span>
              <span className="min-w-0 flex-1 text-base font-bold text-fg [text-wrap:pretty]">
                {e.titulo}
                {e.published ? null : (
                  <span className="font-semibold text-[var(--ds-text-muted-lo)]">
                    {' · '}
                    {t('junta.draft')}
                  </span>
                )}
              </span>
              <Chevron />
            </Link>
          ))}
        </div>
      )}

      {/* ── Com funciona la comi ── */}
      <Heading title={t('junta.home.how')} sub={t('junta.home.howSub')} />
      <div className="mt-6">
        <Row
          to="/junta/periodes"
          title={t('junta.config.periods.title')}
          sub={
            periods.data === undefined || periodsCoverToday(periods.data)
              ? t('junta.home.periodsOk')
              : t('junta.home.periodsStale')
          }
          warn={periods.data !== undefined && !periodsCoverToday(periods.data)}
        />
        <Row
          to="/junta/barem"
          title={t('junta.config.scale.title')}
          sub={t('junta.config.scale.rowSub')}
        />
        <Row
          to="/junta/graus"
          title={t('junta.config.graus.title')}
          sub={t('junta.config.graus.rowSub')}
        />
        <Row to="/junta/registre" title={t('junta.audit.title')} sub={t('junta.audit.rowSub')} />
      </div>

      <p className={`pt-12 text-sm text-[var(--ds-text-muted-lo)] [text-wrap:pretty] ${GUTTER}`}>
        {profile?.role === 'owner' ? t('junta.youAreOwner') : t('junta.youAreAdmin')}
      </p>
    </main>
  )
}

/** How many separate things are asking to be done. */
function workCount(
  data: { readonly pendents: number; readonly esborranys: number },
  porta: DoorNow | null,
): number {
  return data.pendents + data.esborranys + (porta?.esperen ?? 0) + (porta?.no_pagats ?? 0)
}

/**
 * Whether the ranking calendar still has a term covering today.
 *
 * The one configuration mistake that goes unnoticed: every September the terms
 * are last year's, the chips still draw, and every score under them is zero
 * for a reason nobody connects to a date.
 */
function periodsCoverToday(
  periods: readonly { mena: string; starts_at: string | null; ends_at: string | null }[],
): boolean {
  const now = Date.now()
  return periods.some(
    (p) =>
      p.mena === 'tram' &&
      p.starts_at !== null &&
      p.ends_at !== null &&
      Date.parse(p.starts_at) <= now &&
      Date.parse(p.ends_at) > now,
  )
}

// ── the door ────────────────────────────────────────────────────────────────

function Door({ porta, locale }: { readonly porta: DoorNow; readonly locale: Locale }) {
  const { t } = useTranslation()
  const starts = new Date(porta.starts_at)
  const left = placesLeft(porta)

  return (
    <section className="border-b border-surface-5 bg-[var(--ds-bg-door-panel)] px-[var(--ds-gutter)] pt-9 pb-10">
      <p className="flex items-center gap-5">
        <span
          aria-hidden="true"
          className="size-[9px] flex-none animate-pulse rounded-full bg-brand-cta"
        />
        <span className="eyebrow text-brand-accent">{t('junta.home.doorNow')}</span>
      </p>

      <h2 className="display mt-6 text-d-s leading-[0.87] tracking-[-0.048em] [text-wrap:balance]">
        {porta.titulo}
      </h2>
      <p className="mt-5 text-base font-semibold text-fg-secondary [text-wrap:pretty]">
        {[formatDateLong(starts, locale), porta.ubicacion]
          .filter((s): s is string => s !== null && s !== '')
          .join(' · ')}
      </p>

      <div className="mt-8 grid grid-cols-3 gap-[1px] bg-surface-7">
        <Stat n={porta.diuen_si} label={t('junta.home.doorYes')} />
        <Stat n={porta.fitxats} label={t('junta.home.doorIn')} />
        <Stat n={left} label={t('junta.home.doorFree')} />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-5">
        <Link
          to={`/junta/escaner/${porta.id}`}
          className="flex min-h-[78px] items-center justify-center bg-brand-cta px-6 text-xl font-bold text-on-brand no-underline [text-wrap:balance]"
        >
          {t('junta.scan')}
        </Link>
        <Link
          to={`/junta/punts/${porta.id}`}
          className="flex min-h-[78px] items-center justify-center border-[1.5px] border-surface-7 px-6 text-xl font-bold text-fg no-underline [text-wrap:balance]"
        >
          {t('junta.givePoints')}
        </Link>
      </div>

      <p className="mt-5 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {t('junta.home.doorHint')}
      </p>
    </section>
  )
}

function Stat({ n, label }: { readonly n: number | null; readonly label: string }) {
  return (
    <div className="bg-[var(--ds-bg-door-panel)] px-6 py-6">
      <p className="display tabular text-d-s leading-[0.9] tracking-[-0.05em]">{n ?? '—'}</p>
      <p className="eyebrow mt-3 text-[var(--ds-text-muted-lo)]">{label}</p>
    </div>
  )
}

function DoorNone() {
  const { t } = useTranslation()
  return (
    <section className="border-b border-surface-5 bg-surface-1 px-[var(--ds-gutter)] py-9">
      <p className="eyebrow text-fg-muted">{t('junta.home.doorNone')}</p>
      <p className="mt-5 text-base font-semibold text-fg-secondary [text-wrap:pretty]">
        {t('junta.home.doorNoneSub')}
      </p>
      <Link
        to="/junta"
        className="mt-7 inline-flex min-h-[50px] items-center border-[1.5px] border-surface-7 px-8 text-md font-bold text-fg-secondary no-underline"
      >
        {t('junta.home.doorAnyway')}
      </Link>
    </section>
  )
}

/**
 * Not "no event": "we could not find out".
 *
 * The difference is the whole reason this state is drawn separately. And the
 * way to the scanner stays open, because the one thing that still works with
 * no connection is the queue behind it.
 */
function DoorFailed({ onRetry }: { readonly onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <section className="border-b border-surface-5 bg-surface-1 px-[var(--ds-gutter)] py-9">
      <p role="alert" className="text-lg font-bold text-[var(--ds-warning)] [text-wrap:balance]">
        {t('junta.home.doorFailed')}
      </p>
      <p className="mt-4 text-base text-fg-secondary [text-wrap:pretty]">
        {t('junta.home.doorFailedSub')}
      </p>
      <div className="mt-7 flex flex-wrap gap-5">
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[50px] flex-1 border-[1.5px] border-[var(--ds-warning)] px-6 text-md font-bold text-[var(--ds-warning)]"
        >
          {t('actions.retry')}
        </button>
        <Link
          to="/junta"
          className="flex min-h-[50px] flex-1 items-center justify-center border-[1.5px] border-surface-7 px-6 text-md font-bold text-fg-secondary no-underline"
        >
          {t('junta.home.openScanner')}
        </Link>
      </div>
      <p className="mt-5 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {t('junta.home.doorFailedNote')}
      </p>
    </section>
  )
}

function DoorLoading() {
  const { t } = useTranslation()
  return (
    <section
      aria-busy="true"
      className="border-b border-surface-5 bg-surface-1 px-[var(--ds-gutter)] py-9"
    >
      <SkeletonBar w="w-[45%]" h="h-[11px]" />
      <SkeletonBar w="w-[85%]" h="h-[26px]" className="mt-6" />
      <SkeletonBar w="w-[60%]" h="h-[13px]" className="mt-5" />
      <div className="mt-8 grid grid-cols-3 gap-[1px]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="px-2">
            <SkeletonBar w="w-[60%]" h="h-[24px]" />
            <SkeletonBar w="w-[85%]" h="h-[9px]" className="mt-3" />
          </div>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-2 gap-5">
        <SkeletonBar w="w-full" h="h-[78px]" />
        <SkeletonBar w="w-full" h="h-[78px]" />
      </div>
      <p className="mt-6 text-sm text-fg-muted">{t('junta.home.doorLoading')}</p>
    </section>
  )
}

function WorkSkeleton() {
  return (
    <Skeleton className="mt-6">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`flex min-h-[64px] items-center gap-6 border-t border-surface-4 py-6 ${GUTTER}`}
        >
          <SkeletonBar w="w-[38px]" h="h-[28px]" />
          <div className="flex-1">
            <SkeletonBar w="w-[70%]" h="h-[13px]" />
            <SkeletonBar w="w-[45%]" h="h-[10px]" className="mt-3" />
          </div>
        </div>
      ))}
    </Skeleton>
  )
}

function CalendarSkeleton() {
  return (
    <Skeleton className="mt-6">
      {[0, 1].map((i) => (
        <div
          key={i}
          className={`flex min-h-[58px] items-center gap-6 border-t border-surface-4 py-6 ${GUTTER}`}
        >
          <SkeletonBar w="w-[36px]" h="h-[30px]" />
          <SkeletonBar w="w-[55%]" h="h-[13px]" />
        </div>
      ))}
    </Skeleton>
  )
}

// ── the pieces the sections are made of ─────────────────────────────────────

function Heading({
  title,
  sub,
  aside,
  amber = false,
  display = false,
}: {
  readonly title: string
  readonly sub?: string
  readonly aside?: string | undefined
  readonly amber?: boolean
  readonly display?: boolean
}) {
  return (
    <div className={`pt-12 ${GUTTER}`}>
      <div className="flex items-baseline justify-between gap-5">
        <h2
          className={
            display
              ? 'display text-d-sm leading-none tracking-[-0.045em]'
              : `eyebrow ${amber ? 'text-[var(--ds-warning)]' : 'text-fg-muted'}`
          }
        >
          {title}
        </h2>
        {aside === undefined ? null : (
          <span className="flex-none text-[12.5px] font-bold text-[var(--ds-text-muted-lo)]">
            {aside}
          </span>
        )}
      </div>
      {sub === undefined ? null : (
        <p className="mt-4 text-sm text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">{sub}</p>
      )}
    </div>
  )
}

/** A number that is a piece of work, and where to go and do it. */
function Count({
  to,
  n,
  title,
  sub,
}: {
  readonly to: string
  readonly n: number
  readonly title: string
  readonly sub: string
}) {
  return (
    <Link to={to} className={`${ROW} min-h-[64px]`}>
      <span className="display tabular min-w-[50px] flex-none text-[34px] leading-[0.9] tracking-[-0.05em] text-[var(--ds-warning)]">
        {n}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-fg [text-wrap:pretty]">{title}</span>
        <span className="mt-[3px] block text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
          {sub}
        </span>
      </span>
      <Chevron />
    </Link>
  )
}

function Row({
  to,
  title,
  sub,
  badge,
  warn = false,
}: {
  readonly to: string
  readonly title: string
  readonly sub: string
  readonly badge?: number | undefined
  readonly warn?: boolean
}) {
  return (
    <Link to={to} className={ROW}>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-fg [text-wrap:pretty]">{title}</span>
        <span
          className={
            'mt-[3px] block text-[12.5px] [text-wrap:pretty] ' +
            (warn ? 'text-[var(--ds-warning)]' : 'text-[var(--ds-text-muted-lo)]')
          }
        >
          {sub}
        </span>
      </span>
      {badge === undefined || badge === 0 ? null : (
        <span className="tabular flex-none text-md font-bold text-[var(--ds-warning)]">
          {badge}
        </span>
      )}
      <Chevron />
    </Link>
  )
}

function Chevron(): ReactNode {
  return (
    <span aria-hidden="true" className="flex-none text-2xl text-[var(--ds-text-muted-lo)]">
      ›
    </span>
  )
}
