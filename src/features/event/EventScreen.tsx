import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import {
  type AttendanceRow,
  fetchAttendances,
  goingRows,
  homeKeys,
  IN_PROGRESS_MS,
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

import { MyNightBlock } from '@/features/photos/MyNightBlock'
import { RidesBlock } from '@/features/rides/RidesBlock'

import { eventKeys, fetchEvent, fetchWaitlist, formatPrice } from './api'
import { Cover, Fact, Places } from './detail'

const GUTTER = 'px-[var(--ds-gutter)]'

type Translate = ReturnType<typeof useTranslation>['t']

function whenText(e: EventRow, starts: Date, locale: ReturnType<typeof toLocale>, t: Translate) {
  const from = formatDateLong(starts, locale)
  if (e.ends_at === null) return from
  return t('event.facts.until', { from, to: formatTime(new Date(e.ends_at), locale) })
}

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
  // Only worth a tap once the door has let somebody in. Before that the
  // screen has nothing on it, and a link to nothing is a dead end.
  const inside = rows.filter((r) => r.event_id === id && r.estado === 'asistio').length
  // `isPast` starts the moment the event does, which is right for everything
  // else on this page and wrong here: a party in progress is the one time
  // "who is inside" is worth asking. The pulse stops when the party does.
  const ended = now.getTime() >= new Date(e.ends_at ?? starts.getTime() + IN_PROGRESS_MS).getTime()

  return (
    <main className="with-tabbar min-h-dvh bg-app">
      <Cover
        coverUrl={covers.data?.get(e.cover_url ?? '') ?? null}
        isPast={isPast}
        corner={
          <Link
            to="/"
            aria-label={t('actions.back')}
            className="grid size-[44px] place-items-center rounded-full bg-[oklch(0.15_0.012_25/0.7)] text-2xl text-fg backdrop-blur-[6px]"
          >
            <span aria-hidden="true">←</span>
          </Link>
        }
      />

      <section className={`pt-8 ${GUTTER}`}>
        <div className="flex items-start justify-between gap-6">
          <p className="eyebrow text-brand-accent">{formatDateTime(starts, locale)}</p>
          {isPast ? null : <Share event={e} />}
        </div>
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
        total={e.plazas}
        puntos={e.puntos}
        left={left}
        going={going.length}
        isPast={isPast}
        waiting={waitlist.data?.total ?? 0}
      />

      {inside === 0 ? null : (
        <section className={`pt-12 ${GUTTER}`}>
          <Link
            to={`/esdeveniment/${id}/dins`}
            className="flex min-h-[64px] items-center justify-between gap-6 border border-surface-8 bg-surface-2 px-7 py-6 text-fg"
          >
            <span className="flex items-center gap-5">
              {ended ? null : (
                <span
                  aria-hidden="true"
                  className="size-[10px] flex-none animate-pulse rounded-full bg-success"
                />
              )}
              <span className="text-md font-bold [text-wrap:balance]">
                {t(ended ? 'inside.linkPast' : 'inside.link')}
              </span>
            </span>
            <span className="display flex-none text-2xl">{inside}</span>
          </Link>
        </section>
      )}

      {isPast ? null : (
        <AnswerBlock
          mine={mine}
          confirm={e.cal_confirmacio}
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

      {/* Only once it is over, and then for ever: the card on the Inici is the
          nudge and this is where somebody comes looking a fortnight later. */}
      {ended ? <MyNightBlock eventId={e.id} /> : null}

      {e.transport_info === null ? null : (
        <section className={`pt-12 ${GUTTER}`}>
          <h2 className="eyebrow text-fg-muted">{t('event.transport')}</h2>
          <p className="mt-6 text-base text-fg-secondary [text-wrap:pretty]">{e.transport_info}</p>
        </section>
      )}

      {/* Only where somebody has to drive. The flag is per event and not per
          type: a party out of town needs cars, a casa rural fifteen minutes
          away does not. */}
      {e.te_cotxes ? <RidesBlock eventId={e.id} /> : null}

      {e.descripcion === null ? null : (
        <section className={`pt-9 pb-8 ${GUTTER}`}>
          <p className="text-base text-fg-secondary [text-wrap:pretty]">{e.descripcion}</p>
        </section>
      )}
    </main>
  )
}

/**
 * Passing an event on to somebody.
 *
 * The way an event actually spreads is one person sending a link into a group
 * chat, and until now the only way to do that was to copy the address bar,
 * which nobody does from an installed app because there is no address bar.
 *
 * `navigator.share` where it exists — on an installed iPhone it opens the
 * system sheet with WhatsApp first, which is where this is going anyway — and
 * the clipboard where it does not. The label is the confirmation, the same as
 * the invitation code's copy button, because a toast on a screen somebody is
 * about to leave is a toast nobody reads.
 */
function Share({ event }: { readonly event: EventRow }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const link = `${window.location.origin}/esdeveniment/${event.id}`

  async function send(): Promise<void> {
    const text = t('event.shareText', { title: event.titulo, link })
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ text })
        return
      }
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
      }, 2500)
    } catch {
      // The share sheet was dismissed, or the clipboard was refused. Neither
      // is a failure worth a message: nothing was lost and the person is
      // looking at the thing they wanted to send.
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void send()}
      className="-mr-2 -mt-2 min-h-[44px] flex-none px-2 text-md font-bold text-brand-label"
    >
      {copied ? t('event.shared') : t('actions.share')}
    </button>
  )
}

function AnswerBlock({
  mine,
  confirm,
  left,
  position,
  pending,
  failed,
  onAnswer,
  when,
  where,
}: {
  readonly mine: string | null
  /** Whether a yes on this event is a request the junta has to decide. */
  readonly confirm: boolean
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
  // Asked and undecided, and turned down. Both are separate from a plain yes
  // and from a plain no, and saying either of those instead would be the app
  // telling somebody something that is not true about their own trip.
  const requested = mine === 'sollicitat'
  const refused = mine === 'rebutjat'

  return (
    <section className={`pt-12 pb-8 ${GUTTER}`}>
      <h2 className="text-lg font-bold [text-wrap:pretty]">
        {confirm
          ? t('event.ask.confirmTitle')
          : full
            ? t('event.ask.full')
            : t('event.ask.title')}
      </h2>

      {/* Answering back. A lit button is a weak confirmation on a phone — you
          tap, a colour changes, and you are not sure it saved — and this is
          also where the two things you need on the way there get repeated. */}
      {waiting ? null : (
        <div className="mt-6 border-l-[3px] border-surface-7 bg-surface-1 px-[18px] py-[15px]">
          <p className="text-base font-bold [text-wrap:pretty]">
            {requested
              ? t('event.said.requested')
              : refused
                ? t('event.said.refused')
                : mine === 'si'
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
            {requested
              ? t('event.said.requestedSub')
              : refused
                ? t('event.said.refusedSub')
                : mine === 'si'
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
          // A request lights the yes button: it is what was asked for, and
          // a refusal does not, because nothing is selected any more.
          const on = mine === a || (a === 'si' && (waiting || requested))
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
              {a !== 'si'
                ? t(`actions.${a === 'potser' ? 'maybe' : 'no'}`)
                : confirm
                  ? t('event.ask.request')
                  : full
                    ? t('event.ask.queue')
                    : t('actions.yes')}
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
          : requested
            ? t('event.ask.requestedPrivate')
            : confirm && mine !== 'si'
              ? t('event.ask.requestWarning')
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
