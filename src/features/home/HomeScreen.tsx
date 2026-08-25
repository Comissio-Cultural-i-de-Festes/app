import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { firstName } from '@/features/session/profile'

import { movementLine } from './movementLine'
import { useUserId } from '@/features/session/useUserId'
import {
  daysUntil,
  formatDayNumber,
  formatMonthShort,
  formatOrdinal,
  formatTime,
  formatWeekdayLong,
} from '@/i18n/format'
import { type Locale, toLocale } from '@/i18n/locales'
import { ExitPhotoCard } from '@/features/photos/ExitPhotoCard'
import { errorKey } from '@/lib/errors'
import type { Escola } from '@/lib/model'
import { Avatar } from '@/ui/Avatar/Avatar'
import { useCovers } from '@/ui/Cover/useCovers'
import { LogoMark, Wordmark } from '@/ui/Logo/Logo'
import { Notice } from '@/ui/Notice/Notice'

import {
  type AttendanceRow,
  type EventRow,
  goingRows,
  myAnswer,
  placesLeft,
  signedUpToday,
} from './api'
import { type Home, useAnswer, useHome } from './useHome'

const GUTTER = 'px-[var(--ds-gutter)]'
const EYEBROW_TIGHT = 'eyebrow text-fg-muted'

export function HomeScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const home = useHome()
  // One signing round trip for every cover on the screen, rather than one per
  // picture. The buckets are private, so a stored path is not a URL.
  const covers = useCovers([home.hero?.cover_url ?? null, home.previous?.cover_url ?? null])

  // Approved yet? A pending profile can read the calendar — that is what the
  // door promises them — but every write and every list of names is still
  // closed. The screen has to say so, or the only feedback is a button that
  // fails.
  const waiting = home.profile !== null && home.profile.estat !== 'actiu'

  return (
    <div className="with-tabbar min-h-dvh bg-app">
      <Header home={home} />

      {waiting ? (
        <Notice className="mx-[var(--ds-gutter)] mt-1">{t('home.waiting.banner')}</Notice>
      ) : null}

      {/* The morning after, above everything else: it is about last night and
          it is gone by tonight, so burying it under the next event would be
          burying the one thing on this screen with a deadline. */}
      <div className={GUTTER}>
        <ExitPhotoCard event={home.previous ?? null} />
      </div>

      {home.isError ? (
        <ErrorPanel
          message={t(errorKey(home.error))}
          onRetry={home.refetch}
          label={t('actions.retry')}
        />
      ) : null}

      {/* The empty state is a claim about the calendar. It cannot be made while
          the request that would have filled it is the thing that failed. */}
      {home.isError ? null : home.hero ? (
        <>
          <Hero
            event={home.hero}
            locale={locale}
            coverUrl={covers.data?.get(home.hero.cover_url ?? '') ?? null}
          />
          <Places event={home.hero} attendances={home.attendances} />
          <CallToAction event={home.hero} attendances={home.attendances} waiting={waiting} />
        </>
      ) : home.isPending ? (
        <p className={`${GUTTER} py-16 text-center text-fg-muted`}>{t('state.loading')}</p>
      ) : (
        <NothingNext />
      )}

      <RankingTeaser home={home} />
      {home.previous ? (
        <Recap
          event={home.previous}
          attendances={home.attendances}
          coverUrl={covers.data?.get(home.previous.cover_url ?? '') ?? null}
        />
      ) : null}
      <Upcoming events={home.rest} attendances={home.attendances} locale={locale} />
    </div>
  )
}

// ── header ──────────────────────────────────────────────────────────────────

function Header({ home }: { readonly home: Home }) {
  const { t } = useTranslation()
  const name = home.profile ? firstName(home.profile.nombre) : ''

  return (
    <header
      className={`sticky top-0 z-20 flex items-center justify-between gap-3 bg-app pt-[calc(var(--ds-safe-top)+4px)] pb-6 ${GUTTER}`}
    >
      <div className="flex min-w-0 items-center gap-[10px]">
        <LogoMark size={36} />
        <div className="min-w-0">
          <Wordmark size={22} />
          {name === '' ? null : (
            <p className="mt-2 truncate text-xs font-semibold tracking-[0.03em] text-fg-dim">
              {t(`home.greeting.${greetingKey(new Date())}`, { name })}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-none items-center gap-[10px]">
        {home.me ? (
          <p className="tabular flex h-[34px] items-center rounded-chip border border-border-strong px-[13px] text-[13.5px] font-bold">
            {t('units.points', { count: home.me.punts })}
          </p>
        ) : null}
        <Avatar src={home.profile?.avatar_url ?? null} size={38} />
      </div>
    </header>
  )
}

/**
 * Morning, afternoon or night, on the cut-offs Catalan actually uses: "bona
 * tarda" starts after lunch rather than at noon, and the small hours are still
 * "bona nit" — somebody opening the app at one in the morning on the way home
 * has not started their day.
 */
function greetingKey(now: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = now.getHours()
  if (hour < 6) return 'evening'
  if (hour < 13) return 'morning'
  if (hour < 20) return 'afternoon'
  return 'evening'
}

// ── hero ────────────────────────────────────────────────────────────────────

function Hero({
  event,
  locale,
  coverUrl,
}: {
  readonly event: EventRow
  readonly locale: Locale
  readonly coverUrl: string | null
}) {
  const { t } = useTranslation()
  const start = new Date(event.starts_at)

  return (
    <Link
      to={`/esdeveniment/${event.id}`}
      className="relative block h-[260px] bg-[oklch(0.2_0.02_25)] no-underline"
    >
      {coverUrl === null ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[var(--ds-bg-avatar)] bg-[image:var(--ds-pattern-avatar)]"
        />
      ) : (
        <img
          src={coverUrl}
          alt=""
          className="absolute inset-0 size-full object-cover"
          decoding="async"
        />
      )}

      {/* Reads bottom-up: the title sits on the darkest part, so it stays
          legible over any photo the junta uploads without anyone having to
          check the contrast of each one. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,oklch(0.15_0.012_25/0.5)_0%,oklch(0.15_0.012_25/0.15)_34%,oklch(0.15_0.012_25/0.85)_78%,oklch(0.15_0.012_25)_100%)]"
      />

      <div className="absolute right-4 bottom-4 left-[var(--ds-gutter)]">
        <p className="eyebrow text-brand-accent">{whenLabel(start, locale, t)}</p>
        <h1 className="display mt-4 text-[40px] leading-[0.85] tracking-[-0.048em] [overflow-wrap:break-word] [text-wrap:balance]">
          {event.titulo}
        </h1>
      </div>
    </Link>
  )
}

type Translate = ReturnType<typeof useTranslation>['t']

/** "Aquest divendres · 21:00", and what it becomes when the day is further off. */
function whenLabel(start: Date, locale: Locale, t: Translate): string {
  const days = daysUntil(start)
  const time = formatTime(start, locale)

  const when =
    days < 0
      ? t('home.when.now')
      : days === 0
        ? t('time.today')
        : days === 1
          ? t('time.tomorrow')
          : days < 7
            ? t('home.when.thisWeekday', { weekday: formatWeekdayLong(start, locale) })
            : `${formatDayNumber(start, locale)} ${formatMonthShort(start, locale)}`

  return t('home.when.withTime', { when, time })
}

// ── places and who is coming ────────────────────────────────────────────────

function Places({
  event,
  attendances,
}: {
  readonly event: EventRow
  readonly attendances: readonly AttendanceRow[]
}) {
  const { t } = useTranslation()
  const going = goingRows(attendances, event.id)
  const left = placesLeft(event, going.length)

  // Only the detail row is reveal-gated; the count is always known.
  const where = event.ubicacion
  const capacity =
    left === null
      ? where
      : where === null
        ? t('home.places.of', { total: event.plazas })
        : `${t('home.places.of', { total: event.plazas })} · ${where}`

  return (
    <section className={`flex items-end justify-between gap-[14px] pt-8 ${GUTTER}`}>
      <div className="min-w-0">
        {/* No cap, no number. The forty-pixel figure exists to say how much
            room is left, and an event with no limit has nothing to say there —
            inventing a word for it would be the loudest thing on the screen
            saying nothing at all. */}
        {left === null ? null : (
          <p className="tabular display text-[40px] leading-[0.85] tracking-[-0.05em]">
            {left === 0 ? t('home.places.full') : t('home.places.left', { count: left })}
          </p>
        )}
        {capacity === null ? null : (
          <p className={`text-sm font-bold text-fg-muted ${left === null ? '' : 'mt-[5px]'}`}>
            {capacity}
          </p>
        )}
      </div>

      <div className="flex flex-none items-center gap-4 pb-2">
        <div className="flex items-center">
          {going.slice(0, 3).map((row, index) => (
            <span
              key={row.user_id}
              // Overlapping, front to back, each cut out of the background so
              // the stack reads as a stack rather than as a smear.
              className="relative rounded-full border-2 border-app [box-sizing:content-box]"
              style={{ marginLeft: index === 0 ? 0 : -11, zIndex: 3 - index }}
            >
              <Avatar src={row.profiles?.avatar_url ?? null} size={30} />
            </span>
          ))}
        </div>
        <p className="text-sm font-bold text-fg-secondary">
          {t('home.going', { count: going.length })}
        </p>
      </div>
    </section>
  )
}

// ── the answer ──────────────────────────────────────────────────────────────

function CallToAction({
  event,
  attendances,
  waiting,
}: {
  readonly event: EventRow
  readonly attendances: readonly AttendanceRow[]
  readonly waiting: boolean
}) {
  const { t } = useTranslation()
  const userId = useUserId()
  const answer = useAnswer()
  const mine = myAnswer(attendances, event.id, userId)
  const going = mine === 'si' || mine === 'asistio'

  const names = signedUpToday(attendances, event.id, userId, new Date())

  const base =
    'flex w-full min-h-[56px] items-center justify-center px-[18px] py-[15px] ' +
    'text-[18px] font-bold tracking-[-0.01em] text-center [text-wrap:balance] rounded-cta'

  return (
    <section className={`pt-8 ${GUTTER}`}>
      {waiting ? (
        // Not approved yet. The banner above says why; the button keeps its
        // own label so the screen reads the same as everybody else's, which is
        // the point of letting them in this far at all.
        <button type="button" disabled className={`${base} bg-surface-2 text-fg-muted opacity-70`}>
          {t('home.cta.join')}
        </button>
      ) : going ? (
        // Qui ja ha dit que sí és el públic que volem retenir, i aquest és
        // l'únic CTA que veu. Porta a l'esdeveniment, que és on hi ha el
        // sí/potser/no: secundari perquè la decisió ja està presa, però viu,
        // amb el xevró que diu que aquí es va a algun lloc.
        <Link
          to={`/esdeveniment/${event.id}`}
          className={`${base} gap-3 border-[1.5px] border-surface-9 bg-surface-2 text-fg-secondary no-underline`}
        >
          {t('home.cta.going')}
          <span aria-hidden="true" className="flex-none text-[20px]">
            ›
          </span>
        </Link>
      ) : (
        <button
          type="button"
          disabled={answer.isPending}
          onClick={() => {
            answer.mutate({ eventId: event.id, estado: 'si' })
          }}
          className={`${base} bg-brand-cta text-on-brand disabled:opacity-70`}
        >
          {answer.isPending
            ? t('state.updating')
            : mine === 'potser'
              ? t('home.cta.confirm')
              : t('home.cta.join')}
        </button>
      )}

      {answer.isError ? (
        <p role="alert" className="mt-[10px] text-[13.5px] text-error">
          {t('errors.generic')}
        </p>
      ) : null}

      {names.length > 0 ? (
        <p className="mt-[10px] flex items-center gap-[9px] text-[13.5px] text-fg-muted">
          <span
            aria-hidden="true"
            className="size-[9px] flex-none rounded-full bg-brand [animation:comi-pulse_var(--ds-pulse-dur)_ease-in-out_infinite]"
          />
          <span className="flex-1 [text-wrap:pretty]">{movementLine(names, t)}</span>
        </p>
      ) : null}
    </section>
  )
}

// ── the ranking strip ───────────────────────────────────────────────────────

function RankingTeaser({ home }: { readonly home: Home }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  if (!home.me) return null

  const mine = home.profile?.escola ?? null
  const school = mine === null ? null : (home.schools.find((s) => s.escola === mine) ?? null)
  const above =
    school === null ? null : (home.schools.find((s) => s.posicio === school.posicio - 1) ?? null)

  // What the school would need in total points to draw level, which is the
  // per-member gap multiplied back out by how many of them there are.
  const gap =
    school === null || above === null
      ? null
      : Math.max(0, Math.round((above.punts_per_membre - school.punts_per_membre) * school.membres))

  return (
    <section className={`mt-12 border-y border-surface-7 py-[18px] ${GUTTER}`}>
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className={EYEBROW_TIGHT}>
            {t('home.rank.you', {
              position: formatOrdinal(home.me.posicio, locale),
              total: home.total,
            })}
          </p>
          <p className="tabular display mt-[7px] text-[46px] leading-[0.85] tracking-[-0.05em]">
            {home.me.punts}{' '}
            <span className="font-body text-xl font-bold tracking-normal text-fg-muted normal-case">
              {t('home.rank.pointsWord')}
            </span>
          </p>
        </div>

        {school ? (
          <div className="pb-[5px] text-right">
            <p className="text-sm font-bold text-brand-accent">
              {/* The subject form, with its article: "La Politècnica va 2a",
                  "L'Empresa va 2a". Catalan contracts the article against the
                  next word, so this cannot be assembled from the plain name in
                  code — each form is its own key. */}
              {t('home.rank.school', {
                school: t(`escolaSubject.${school.escola satisfies Escola}`),
                position: formatOrdinal(school.posicio, locale, 'f'),
              })}
            </p>
            {gap !== null && above ? (
              <p className="mt-[3px] text-[12.5px] text-[var(--ds-text-muted-lo)]">
                {/* And the genitive: "a 340 punts d'Empresa", not "de
                    Empresa". */}
                {t('home.rank.behind', {
                  count: gap,
                  school: t(`escolaOf.${above.escola satisfies Escola}`),
                })}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="mt-6 text-[13.5px] text-fg-muted [text-wrap:pretty]">
        {t('home.rank.nudge')}{' '}
        <Link to="/ranquing" className="font-bold">
          {t('home.rank.link')}
        </Link>
      </p>
    </section>
  )
}

// ── last time ───────────────────────────────────────────────────────────────

function Recap({
  event,
  attendances,
  coverUrl,
}: {
  readonly event: EventRow
  readonly attendances: readonly AttendanceRow[]
  readonly coverUrl: string | null
}) {
  const { t } = useTranslation()
  const attended = attendances.filter(
    (r) => r.event_id === event.id && r.estado === 'asistio',
  ).length

  return (
    <section className={`pt-[22px] ${GUTTER}`}>
      <h2 className={`${EYEBROW_TIGHT} mb-6`}>{t('home.recap.title')}</h2>
      <div className="flex items-stretch gap-[14px]">
        {coverUrl === null ? (
          <div
            aria-hidden="true"
            className="size-[104px] flex-none rounded-sm bg-[var(--ds-bg-avatar)] bg-[image:var(--ds-pattern-avatar)]"
          />
        ) : (
          <img
            src={coverUrl}
            alt=""
            className="size-[104px] flex-none rounded-sm object-cover"
            decoding="async"
          />
        )}

        <div className="flex flex-1 flex-col justify-between">
          <div>
            <p className="text-xl leading-[1.15] font-bold [text-wrap:pretty]">{event.titulo}</p>
            {attended > 0 ? (
              <p className="mt-[6px] text-[13.5px] text-fg-muted">
                {t('home.recap.were', { count: attended })}
              </p>
            ) : null}
          </div>
          <p className="flex items-baseline gap-4">
            <span className="tabular display text-3xl tracking-[-0.04em] text-brand-accent">
              +{event.puntos}
            </span>
            <span className="text-sm font-semibold text-fg-muted">{t('home.recap.points')}</span>
          </p>
        </div>
      </div>
    </section>
  )
}

// ── what else is coming ─────────────────────────────────────────────────────

function Upcoming({
  events,
  attendances,
  locale,
}: {
  readonly events: readonly EventRow[]
  readonly attendances: readonly AttendanceRow[]
  readonly locale: Locale
}) {
  const { t } = useTranslation()

  return (
    <section className={`pt-[26px] ${GUTTER}`}>
      <h2 className={`${EYEBROW_TIGHT} mb-2`}>{t('home.upcoming.title')}</h2>
      <ul>
        {events.map((event) => {
          const start = new Date(event.starts_at)
          const left = placesLeft(event, goingRows(attendances, event.id).length)
          const sub = [event.teaser, left === null ? null : t('units.placesLeft', { count: left })]
            .filter((part): part is string => part !== null && part !== '')
            .join(' · ')

          return (
            <li key={event.id} className="border-b border-surface-5">
              <Link
                to={`/esdeveniment/${event.id}`}
                className="flex items-center gap-[14px] py-[15px] no-underline"
              >
                <div className="w-[46px] flex-none text-center">
                  <p className="text-2xs font-extrabold tracking-[0.1em] uppercase text-brand-accent">
                    {formatMonthShort(start, locale)}
                  </p>
                  <p className="tabular display text-[27px] leading-[0.9] tracking-[-0.04em]">
                    {formatDayNumber(start, locale)}
                  </p>
                </div>
                <div className="flex-1">
                  <p className="text-lg leading-[1.15] font-bold [text-wrap:pretty]">
                    {event.titulo}
                  </p>
                  {sub === '' ? null : (
                    <p className="mt-2 text-sm text-fg-muted [text-wrap:pretty]">{sub}</p>
                  )}
                </div>
                <span aria-hidden="true" className="flex-none text-[20px] text-fg-faint">
                  ›
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      <p className="pt-8 pb-[10px] text-sm text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {events.length === 0 ? t('home.upcoming.none') : t('home.upcoming.thatIsAll')}
      </p>
    </section>
  )
}

/**
 * No events at all. Since a pending profile can now read the calendar, this
 * means what it says rather than "you are not allowed to see any of this".
 */
function NothingNext() {
  const { t } = useTranslation()
  return (
    <section className={`pt-10 ${GUTTER}`}>
      <p className="display text-d-sm [text-wrap:balance]">{t('home.empty.title')}</p>
      <p className="mt-3 text-fg-muted [text-wrap:pretty]">{t('home.empty.body')}</p>
    </section>
  )
}

function ErrorPanel({
  message,
  onRetry,
  label,
}: {
  readonly message: string
  readonly onRetry: () => void
  readonly label: string
}) {
  return (
    <div role="alert" className={`flex items-center justify-between gap-3 py-3 ${GUTTER}`}>
      <p className="text-sm text-error [text-wrap:pretty]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="-mr-3 min-h-[44px] flex-none px-3 text-sm font-bold text-brand-label"
      >
        {label}
      </button>
    </div>
  )
}
