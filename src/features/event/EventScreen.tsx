import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import {
  type AttendanceRow,
  fetchAttendances,
  goingRows,
  homeKeys,
  myAnswer,
  placesLeft,
  setAnswer,
  signedUpToday,
} from '@/features/home/api'
import { useUserId } from '@/features/session/useUserId'
import { formatDateLong, formatDateTime, formatOrdinal, formatTime } from '@/i18n/format'
import { INTL_LOCALE, toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { ANSWERS, type Answer } from '@/lib/model'
import type { EventRow } from '@/lib/schema'
import { Avatar } from '@/ui/Avatar/Avatar'
import { useCovers } from '@/ui/Cover/useCovers'

import { eventKeys, fetchEvent, fetchWaitlist, formatPrice } from './api'

/**
 * One event, at length.
 *
 * The poster comes first and the answer comes last, in that order, because the
 * brief is explicit that the cover is what makes somebody read the rest and
 * the faces above the buttons are what makes them press one.
 *
 * The privacy rule sits next to the button that triggers it rather than in a
 * footnote: saying yes puts your face on a public list, and that is worth
 * knowing before rather than after.
 */

const GUTTER = 'px-[var(--ds-gutter)]'
const FACES = 5

export function EventScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const userId = useUserId()
  const client = useQueryClient()
  const { id = '' } = useParams()

  // One reading of the clock for the whole screen, taken once. Calling
  // Date.now() twice during a render can put "already happened" and "signed up
  // today" on opposite sides of the same midnight.
  const [now] = useState(() => new Date())

  const event = useQuery({ queryKey: eventKeys.one(id), queryFn: () => fetchEvent(id) })
  const attendances = useQuery({
    queryKey: homeKeys.attendances([id]),
    queryFn: () => fetchAttendances([id]),
  })
  const waitlist = useQuery({
    queryKey: eventKeys.waitlist(id),
    queryFn: () => fetchWaitlist(id),
  })
  const covers = useCovers([event.data?.cover_url ?? null])

  const answer = useMutation({
    mutationFn: (estado: Answer) => setAnswer(id, estado),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['home', 'attendances'] })
      await client.invalidateQueries({ queryKey: eventKeys.waitlist(id) })
    },
  })

  if (event.isPending) {
    return (
      <main className="with-tabbar flex min-h-dvh items-center justify-center bg-app pt-[var(--ds-safe-top)]">
        <p className="text-fg-muted">{t('state.loading')}</p>
      </main>
    )
  }

  if (event.isError) {
    return (
      <main className={`with-tabbar min-h-dvh bg-app pt-[calc(var(--ds-safe-top)+32px)] ${GUTTER}`}>
        <p role="alert" className="text-lg font-bold text-error [text-wrap:pretty]">
          {t(errorKey(event.error))}
        </p>
        <button
          type="button"
          onClick={() => void event.refetch()}
          className="-ml-2 mt-8 inline-flex min-h-[44px] items-center px-2 text-md font-bold text-brand-label"
        >
          {t('actions.retry')}
        </button>
      </main>
    )
  }

  if (event.data == null) {
    return (
      <main className={`with-tabbar min-h-dvh bg-app pt-[calc(var(--ds-safe-top)+32px)] ${GUTTER}`}>
        <p className="display text-d-sm [text-wrap:balance]">{t('event.gone.title')}</p>
        <p className="mt-6 text-fg-muted [text-wrap:pretty]">{t('event.gone.body')}</p>
        <Link
          to="/"
          className="-ml-2 mt-8 inline-flex min-h-[44px] items-center px-2 text-md font-bold text-brand-label"
        >
          {t('event.gone.back')}
        </Link>
      </main>
    )
  }

  const e = event.data
  const rows: readonly AttendanceRow[] = attendances.data ?? []
  const going = goingRows(rows, id)
  const mine = myAnswer(rows, id, userId)
  const left = placesLeft(e, going.length)
  const starts = new Date(e.starts_at)
  const isPast = starts.getTime() < now.getTime()
  const price = formatPrice(e.precio_cents, INTL_LOCALE[locale])
  const movement = signedUpToday(rows, id, userId, now)

  return (
    <main className="with-tabbar min-h-dvh bg-app">
      <Cover coverUrl={covers.data?.get(e.cover_url ?? '') ?? null} isPast={isPast} />

      <section className={`pt-8 ${GUTTER}`}>
        <p className="eyebrow text-brand-accent">{formatDateTime(starts, locale)}</p>
        <h1 className="display mt-4 text-d-md leading-[0.88] tracking-[-0.05em] [overflow-wrap:break-word] [text-wrap:balance]">
          {e.titulo}
        </h1>
        {e.teaser === null ? null : (
          <p className="mt-6 text-lg text-fg-secondary [text-wrap:pretty]">{e.teaser}</p>
        )}
      </section>

      {going.length > 0 ? (
        <section className={`pt-9 ${GUTTER}`}>
          <div className="flex items-center gap-4">
            <div className="flex items-center">
              {going.slice(0, FACES).map((row, index) => (
                <span
                  key={row.user_id}
                  className="relative rounded-full border-2 border-app [box-sizing:content-box]"
                  style={{ marginLeft: index === 0 ? 0 : -11, zIndex: FACES - index }}
                >
                  <Avatar src={row.profiles?.avatar_url ?? null} size={34} />
                </span>
              ))}
            </div>
            <p className="text-md font-bold text-fg-secondary [text-wrap:pretty]">
              {isPast
                ? t('event.whoCame', { count: going.length })
                : t('event.whoComes', { count: going.length })}
            </p>
          </div>
          <p className="mt-4 text-sm text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
            {t('event.onlyYeses')}
          </p>
          {movement.length > 0 ? (
            <p className="mt-6 flex items-center gap-[9px] text-[13.5px] text-fg-muted">
              <span
                aria-hidden="true"
                className="size-[9px] flex-none rounded-full bg-brand [animation:comi-pulse_var(--ds-pulse-dur)_ease-in-out_infinite]"
              />
              <span className="flex-1 [text-wrap:pretty]">
                {t('event.movement', { count: movement.length })}
              </span>
            </p>
          ) : null}
        </section>
      ) : null}

      {/* The three facts people ask in the group, in the order they ask them. */}
      <section className={`mt-9 border-y border-surface-7 py-8 ${GUTTER}`}>
        <Fact label={t('event.facts.when')} value={whenText(e, starts, locale, t)} />
        {e.ubicacion === null ? null : <Fact label={t('event.facts.where')} value={e.ubicacion} />}
        <Fact label={t('event.facts.price')} value={price ?? t('event.facts.free')} />
      </section>

      <Places
        event={e}
        left={left}
        going={going.length}
        isPast={isPast}
        waiting={waitlist.data?.total ?? 0}
      />

      {isPast ? null : (
        <AnswerBlock
          mine={mine}
          left={left}
          position={
            waitlist.data?.posicio == null ? null : formatOrdinal(waitlist.data.posicio, locale)
          }
          pending={answer.isPending}
          failed={answer.isError}
          onAnswer={(a) => {
            answer.mutate(a)
          }}
          when={formatDateLong(starts, locale)}
          where={e.ubicacion}
        />
      )}

      {e.transport_info === null ? null : (
        <section className={`pt-12 ${GUTTER}`}>
          <h2 className="text-xs font-extrabold tracking-[0.16em] text-fg-muted uppercase">
            {t('event.transport')}
          </h2>
          <p className="mt-6 text-base text-fg-secondary [text-wrap:pretty]">{e.transport_info}</p>
        </section>
      )}

      {e.descripcion === null ? null : (
        <section className={`pt-9 pb-8 ${GUTTER}`}>
          <p className="text-base text-fg-secondary [text-wrap:pretty]">{e.descripcion}</p>
        </section>
      )}
    </main>
  )
}

type Translate = ReturnType<typeof useTranslation>['t']

function whenText(e: EventRow, starts: Date, locale: ReturnType<typeof toLocale>, t: Translate) {
  const from = formatDateLong(starts, locale)
  if (e.ends_at === null) return from
  return t('event.facts.until', { from, to: formatTime(new Date(e.ends_at), locale) })
}

function Cover({
  coverUrl,
  isPast,
}: {
  readonly coverUrl: string | null
  readonly isPast: boolean
}) {
  const { t } = useTranslation()

  return (
    <section className="relative h-[240px] bg-[oklch(0.2_0.02_25)]">
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
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,oklch(0.15_0.012_25/0.55)_0%,oklch(0.15_0.012_25/0.1)_40%,oklch(0.15_0.012_25/0.8)_82%,oklch(0.15_0.012_25)_100%)]"
      />

      <Link
        to="/"
        aria-label={t('actions.back')}
        className="absolute top-4 left-4 grid size-[44px] place-items-center rounded-full bg-[oklch(0.15_0.012_25/0.7)] text-2xl text-fg backdrop-blur-[6px]"
      >
        <span aria-hidden="true">←</span>
      </Link>

      {isPast ? (
        <p className="absolute top-6 right-4 rounded-xs bg-[var(--ds-badge-past-bg)] px-4 py-2 text-2xs font-extrabold tracking-[0.1em] text-[var(--ds-badge-past-fg)] uppercase">
          {t('event.past')}
        </p>
      ) : null}
    </section>
  )
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex gap-6 py-2">
      <p className="w-[64px] flex-none text-2xs font-extrabold tracking-[0.08em] text-fg-dim uppercase">
        {label}
      </p>
      <p className="flex-1 text-base text-fg-secondary [text-wrap:pretty]">{value}</p>
    </div>
  )
}

function Places({
  event,
  left,
  going,
  isPast,
  waiting,
}: {
  readonly event: EventRow
  readonly left: number | null
  readonly going: number
  readonly isPast: boolean
  readonly waiting: number
}) {
  const { t } = useTranslation()

  if (isPast) {
    return (
      <section className={`flex items-end gap-9 pt-9 ${GUTTER}`}>
        <div>
          <p className="tabular display text-d-lg leading-[0.85] tracking-[-0.05em]">{going}</p>
          <p className="mt-2 text-sm font-bold text-fg-muted">{t('event.wereThere')}</p>
        </div>
        <div>
          <p className="tabular display text-d-sm leading-[0.85] tracking-[-0.05em] text-brand-accent">
            +{event.puntos}
          </p>
          <p className="mt-2 text-sm font-bold text-fg-muted">{t('event.pointsForComing')}</p>
        </div>
      </section>
    )
  }

  if (left === null) return null

  return (
    <section className={`pt-9 ${GUTTER}`}>
      <p
        className={
          'tabular display text-d-lg leading-[0.85] tracking-[-0.05em] ' +
          (left === 0 ? 'text-[var(--ds-warning-deep)]' : '')
        }
      >
        {left === 0 ? t('event.full') : t('home.places.left', { count: left })}
      </p>
      <p className="mt-4 text-sm font-bold text-fg-muted [text-wrap:pretty]">
        {left === 0
          ? waiting > 0
            ? t('event.fullWithQueue', { count: waiting })
            : t('event.fullNoQueue')
          : t('home.places.of', { total: event.plazas })}
      </p>
    </section>
  )
}

function AnswerBlock({
  mine,
  left,
  position,
  pending,
  failed,
  onAnswer,
  when,
  where,
}: {
  readonly mine: string | null
  readonly left: number | null
  readonly position: string | null
  readonly pending: boolean
  readonly failed: boolean
  readonly onAnswer: (a: Answer) => void
  /** Weekday, date and start time in one — formatDateLong already joins them. */
  readonly when: string
  readonly where: string | null
}) {
  const { t } = useTranslation()
  const full = left === 0
  const waiting = mine === 'espera'

  return (
    <section className={`pt-12 pb-8 ${GUTTER}`}>
      <h2 className="text-lg font-bold [text-wrap:pretty]">
        {full ? t('event.ask.full') : t('event.ask.title')}
      </h2>

      {/* Answering back. A lit button is a weak confirmation on a phone — you
          tap, a colour changes, and you are not sure it saved — and this is
          also where the two things you need on the way there get repeated. */}
      {waiting ? null : (
        <div className="mt-6 border-l-[3px] border-surface-7 bg-surface-1 px-[18px] py-[15px]">
          <p className="text-base font-bold [text-wrap:pretty]">
            {mine === 'si'
              ? where === null
                ? t('event.said.yesNoPlace', { when })
                : t('event.said.yes', { when, where })
              : mine === 'potser'
                ? t('event.said.maybe')
                : mine === 'no'
                  ? t('event.said.no')
                  : t('event.said.nothing')}
          </p>
          <p className="mt-3 text-sm text-fg-muted [text-wrap:pretty]">
            {mine === 'si'
              ? t('event.said.yesSub')
              : mine === 'potser'
                ? t('event.said.maybeSub')
                : mine === 'no'
                  ? t('event.said.noSub')
                  : t('event.said.nothingSub')}
          </p>
        </div>
      )}

      <div className="mt-6 grid auto-cols-fr grid-flow-col items-stretch gap-[6px]">
        {ANSWERS.map((a) => {
          const on = mine === a || (a === 'si' && waiting)
          return (
            <button
              key={a}
              type="button"
              disabled={pending}
              aria-pressed={on}
              onClick={() => {
                onAnswer(a)
              }}
              className={
                'flex min-h-[56px] items-center justify-center px-4 py-4 text-lg font-bold ' +
                '[text-wrap:balance] disabled:opacity-70 ' +
                (on
                  ? 'bg-brand-cta text-on-brand'
                  : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg-secondary')
              }
            >
              {a === 'si' && full
                ? t('event.ask.queue')
                : t(`actions.${a === 'si' ? 'yes' : a === 'potser' ? 'maybe' : 'no'}`)}
            </button>
          )
        })}
      </div>

      {failed ? (
        <p role="alert" className="mt-6 text-md font-bold text-error [text-wrap:pretty]">
          {t('errors.generic')}
        </p>
      ) : null}

      {/* Next to the button that causes it, not in a footnote at the bottom.
          On a full event the yes button joins a queue instead, and a queue is
          not a public list — saying it is would be a warning about something
          that does not happen. */}
      <p className="mt-6 text-sm text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {waiting
          ? t('event.ask.queuePrivate')
          : mine === 'si'
            ? t('event.ask.yesPublic')
            : mine === 'potser' || mine === 'no'
              ? t('event.ask.privateAnswer')
              : full
                ? t('event.ask.queueWarning')
                : t('event.ask.yesWarning')}
      </p>

      {waiting ? (
        <p className="mt-8 border-l-[3px] border-warning bg-surface-1 px-[18px] py-[15px] text-md text-fg-secondary [text-wrap:pretty]">
          {position === null ? t('event.queue.onList') : t('event.queue.position', { position })}
        </p>
      ) : null}
    </section>
  )
}
