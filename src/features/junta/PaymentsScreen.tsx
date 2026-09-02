import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'

import { formatMoney, formatPrice } from '@/features/event/api'
import { horizonIso } from '@/features/home/api'
import { formatDayMonth } from '@/i18n/format'
import { INTL_LOCALE, toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import type { EventRow } from '@/lib/schema'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Notice } from '@/ui/Notice/Notice'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { JuntaHeader } from './JuntaHeader'
import { fetchJuntaEvents, juntaEventKeys } from './eventsApi'
import {
  type AttendeeRow,
  fetchAttendees,
  type Decision,
  decideRequest,
  fetchQueue,
  fetchRequests,
  letInFromQueue,
  paymentKeys,
  setPaid,
} from './paymentsApi'

/**
 * Who has paid, and who runs this.
 *
 * The money moves somewhere else and always has. What this replaces is the
 * spreadsheet on the treasurer's phone, so a row is one tap and the total
 * follows. Green for paid, amber for pending: the brand red never means a
 * problem anywhere in this app, and at four in the morning under a bad light
 * the two have to be different in more than hue, so paid also gets a filled
 * disc and pending an empty ring.
 *
 * Naming admins lives on the same screen because the prototype puts it there,
 * and because both are things you do sitting down after an event rather than
 * standing at a door.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function PaymentsScreen() {
  const { t } = useTranslation()
  const { eventId } = useParams()

  const horizon = horizonIso()
  const events = useQuery({
    queryKey: juntaEventKeys.list(horizon),
    queryFn: () => fetchJuntaEvents(horizon),
  })

  // No event in the address bar means the next one, which is what the junta
  // wants nine times out of ten. Switching is a select rather than a screen of
  // its own: the second event of the term still has to be reachable.
  const list = events.data ?? []
  const chosen = eventId ?? list[0]?.id ?? null
  const event = list.find((e) => e.id === chosen) ?? null

  const attendees = useQuery({
    queryKey: paymentKeys.attendees(chosen ?? ''),
    queryFn: () => fetchAttendees(chosen ?? ''),
    enabled: chosen !== null,
  })

  return (
    <main className="min-h-dvh bg-app pb-[calc(var(--ds-safe-bottom)+24px)]">
      <JuntaHeader
        to="/junta"
        className="lg:hidden"
        label={t('junta.back')}
        aside={<Picker list={list} chosen={chosen} className="max-w-[220px] text-right" />}
      />

      {/* The laptop has no back link to hang it off, so the picker gets its
          own row. Without it the desk screen could only ever settle up the
          first event on the calendar. */}
      <div className="hidden items-center gap-6 border-b border-surface-5 px-14 py-6 lg:flex">
        <Picker list={list} chosen={chosen} />
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-15 lg:px-14 lg:pb-16">
        <div>
          {events.isPending ? (
            <PaidSkeleton head />
          ) : events.isError ? (
            <p role="alert" className={`pt-10 text-md font-bold text-error ${GUTTER}`}>
              {t(errorKey(events.error))}
            </p>
          ) : event === null ? (
            <p className={`pt-10 text-md text-fg-muted [text-wrap:pretty] ${GUTTER}`}>
              {t('junta.noEvents')}
            </p>
          ) : (
            <PaidList
              eventId={event.id}
              priceCents={event.precio_cents ?? 0}
              rows={attendees.data ?? []}
              loading={attendees.isPending}
              error={attendees.error}
            />
          )}
          {event === null ? null : <Requests eventId={event.id} />}
          {event === null ? null : <Queue eventId={event.id} />}
        </div>
        <WhoRuns />
      </div>
    </main>
  )
}

/**
 * The people who have asked for a place, and the two words that answer them.
 *
 * Above the waiting list rather than folded into it, because the two are not
 * the same question. The list is "somebody else had the last place, are you
 * letting this one in"; this is "who is coming at all", and it has a no as
 * well as a yes.
 *
 * Not numbered. The list is first-come-first-served and this is not, and a
 * rank down the left would state a rule nobody agreed to.
 */
function Requests({ eventId }: { readonly eventId: string }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [note, setNote] = useState<Decision | null>(null)

  const requests = useQuery({
    queryKey: paymentKeys.requests(eventId),
    queryFn: () => fetchRequests(eventId),
  })

  const decide = useMutation({
    mutationFn: (v: { readonly userId: string; readonly accepta: boolean }) =>
      decideRequest(eventId, v.userId, v.accepta),
    onSuccess: async (result) => {
      // `sense_places` and `no_demanat` are answers, not failures, so they get
      // said out loud instead of arriving as a generic red line.
      setNote(result === 'si' || result === 'rebutjat' ? null : result)
      await client.invalidateQueries({ queryKey: paymentKeys.requests(eventId) })
      await client.invalidateQueries({ queryKey: paymentKeys.attendees(eventId) })
    },
  })

  // Nothing at all on an ordinary event: a heading that means nothing on nine
  // events out of ten is a heading people stop reading.
  const rows = requests.data ?? []
  if (requests.isPending || rows.length === 0) return null

  return (
    <section className={`pt-14 ${GUTTER}`}>
      <h2 className="display text-d-sm leading-none tracking-[-0.045em]">
        {t('junta.payments.requests', { count: rows.length })}
      </h2>
      <p className="mt-4 text-sm text-fg-muted [text-wrap:pretty]">
        {t('junta.payments.requestsSub')}
      </p>

      <ul className="mt-7">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center gap-4 border-b border-surface-4 py-6"
          >
            <Avatar src={r.profiles?.avatar_url ?? null} size={36} />
            <span className="min-w-0 flex-1 truncate text-base font-semibold">
              {r.profiles?.nombre ?? '—'}
            </span>
            <span className="flex flex-none items-center gap-3">
              <button
                type="button"
                disabled={decide.isPending}
                onClick={() => {
                  setNote(null)
                  decide.mutate({ userId: r.user_id, accepta: true })
                }}
                className="min-h-[44px] bg-brand-cta px-5 text-md font-bold text-on-brand disabled:opacity-70"
              >
                {t('junta.payments.confirmIn')}
              </button>
              <button
                type="button"
                disabled={decide.isPending}
                onClick={() => {
                  setNote(null)
                  decide.mutate({ userId: r.user_id, accepta: false })
                }}
                className="min-h-[44px] border-[1.5px] border-surface-7 px-5 text-md font-bold text-fg-secondary disabled:opacity-70"
              >
                {t('junta.payments.refuse')}
              </button>
            </span>
          </li>
        ))}
      </ul>

      {note === null ? null : (
        <p
          role="alert"
          className="pt-6 text-md font-bold text-[var(--ds-warning)] [text-wrap:pretty]"
        >
          {t(note === 'sense_places' ? 'junta.payments.noRoomLeft' : 'junta.payments.gone')}
        </p>
      )}

      {decide.isError ? (
        <p role="alert" className="pt-6 text-md font-bold text-error">
          {t(errorKey(decide.error))}
        </p>
      ) : null}
    </section>
  )
}

/**
 * The waiting list, and letting somebody in off it.
 *
 * The member's side of this is deliberately blind — you see your own position
 * and how many are waiting, never who. This is the other half: the only place
 * the queue exists as a list of names, and the only place anybody can move
 * someone off it, which the junta does by hand on purpose.
 */
function Queue({ eventId }: { readonly eventId: string }) {
  const { t } = useTranslation()
  const client = useQueryClient()

  const queue = useQuery({
    queryKey: paymentKeys.queue(eventId),
    queryFn: () => fetchQueue(eventId),
  })

  const letIn = useMutation({
    mutationFn: (attendanceId: string) => letInFromQueue(attendanceId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: paymentKeys.queue(eventId) })
      await client.invalidateQueries({ queryKey: paymentKeys.attendees(eventId) })
    },
  })

  // Nothing at all when nobody is waiting: an empty "waiting list" heading on
  // every event would be a section that means nothing 90% of the time.
  if (queue.isPending || (queue.data?.length ?? 0) === 0) return null

  return (
    <section className={`pt-14 ${GUTTER}`}>
      <h2 className="display text-d-sm leading-none tracking-[-0.045em]">
        {t('junta.payments.queue', { count: queue.data?.length ?? 0 })}
      </h2>
      <p className="mt-4 text-sm text-fg-muted [text-wrap:pretty]">
        {t('junta.payments.queueSub')}
      </p>

      <ul className="mt-7">
        {queue.data?.map((r, index) => (
          <li
            key={r.id}
            className="flex min-h-[56px] items-center gap-4 border-b border-surface-4 py-6"
          >
            <span className="tabular w-[22px] flex-none text-md font-bold text-fg-muted">
              {index + 1}
            </span>
            <Avatar src={r.profiles?.avatar_url ?? null} size={36} />
            <span className="min-w-0 flex-1 truncate text-base font-semibold">
              {r.profiles?.nombre ?? '—'}
            </span>
            <button
              type="button"
              disabled={letIn.isPending}
              onClick={() => {
                letIn.mutate(r.id)
              }}
              className="min-h-[44px] flex-none bg-brand-cta px-6 text-md font-bold text-on-brand disabled:opacity-70"
            >
              {t('junta.invites.letIn')}
            </button>
          </li>
        ))}
      </ul>

      {letIn.isError ? (
        <p role="alert" className="pt-6 text-md font-bold text-error">
          {t(errorKey(letIn.error))}
        </p>
      ) : null}
    </section>
  )
}

/**
 * Which event is being settled up.
 *
 * A native select on purpose: on a phone it is the system wheel, which beats
 * anything a list of forty events could be made to do with one thumb, and on a
 * laptop it takes the keyboard for free.
 */
function Picker({
  list,
  chosen,
  className = '',
}: {
  readonly list: readonly EventRow[]
  readonly chosen: string | null
  readonly className?: string
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const navigate = useNavigate()

  if (list.length === 0) return null

  return (
    <label className="flex min-h-[44px] min-w-0 items-center">
      <span className="sr-only">{t('junta.payments.pickEvent')}</span>
      <select
        value={chosen ?? ''}
        onChange={(e) => {
          void navigate(`/junta/pagaments/${e.target.value}`, { replace: true })
        }}
        className={`eyebrow truncate bg-transparent text-fg-muted ${className}`}
      >
        {list.map((e) => (
          <option key={e.id} value={e.id}>
            {formatDayMonth(new Date(e.starts_at), locale)} · {e.titulo}
          </option>
        ))}
      </select>
    </label>
  )
}

function PaidList({
  eventId,
  priceCents,
  rows,
  loading,
  error,
}: {
  readonly eventId: string
  readonly priceCents: number
  readonly rows: readonly AttendeeRow[]
  readonly loading: boolean
  readonly error: Error | null
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const client = useQueryClient()

  const paid = rows.filter((r) => r.pagado)
  // A free event has no money to count, so the whole green half disappears
  // rather than standing there reading "0 €".
  const each = formatPrice(priceCents, INTL_LOCALE[locale])
  const total = each === null ? null : formatMoney(paid.length * priceCents, INTL_LOCALE[locale])

  const toggle = useMutation({
    mutationFn: ({ id, pagado }: { id: string; pagado: boolean }) => setPaid(id, pagado),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: paymentKeys.attendees(eventId) })
    },
  })

  return (
    <>
      <section className={`pt-8 ${GUTTER}`}>
        <h1 className="display text-d-md leading-[0.9] tracking-[-0.05em]">
          {t('junta.payments.whoPaid')}
        </h1>

        <div className="mt-7 flex items-end gap-7">
          <div>
            <p className="display text-d-xl leading-[0.95] tracking-[-0.055em] tabular-nums">
              {paid.length}
            </p>
            <p className="mt-1 text-sm font-bold text-fg-muted">
              {t('junta.payments.ofSignedUp', { count: rows.length })}
            </p>
          </div>
          {each === null || total === null ? null : (
            <div className="flex-1 pb-2">
              <p className="text-xl font-extrabold tracking-[-0.02em] text-success">{total}</p>
              <p className="mt-1 text-sm font-semibold text-fg-muted [text-wrap:pretty]">
                {t('junta.payments.eachOne', { price: each })}
              </p>
            </div>
          )}
        </div>

        <Notice tone="neutral" size="tight" className="mt-8 font-medium">
          {t('junta.payments.bizum')}
        </Notice>
      </section>

      {loading ? (
        <PaidSkeleton />
      ) : error !== null ? (
        <p role="alert" className={`pt-10 text-md font-bold text-error ${GUTTER}`}>
          {t(errorKey(error))}
        </p>
      ) : rows.length === 0 ? (
        <p className={`pt-10 text-md text-fg-muted [text-wrap:pretty] ${GUTTER}`}>
          {t('junta.payments.nobody')}
        </p>
      ) : (
        <ul className="mt-10">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                aria-pressed={r.pagado}
                disabled={toggle.isPending}
                onClick={() => {
                  toggle.mutate({ id: r.id, pagado: !r.pagado })
                }}
                className={
                  `flex min-h-[56px] w-full items-center gap-4 border-b border-surface-4 ` +
                  `px-[var(--ds-gutter)] py-[11px] text-left ` +
                  (r.pagado ? 'bg-[var(--ds-bg-paid)]' : '')
                }
              >
                <span
                  aria-hidden="true"
                  className={
                    'flex size-[26px] flex-none items-center justify-center rounded-full text-sm font-extrabold ' +
                    (r.pagado
                      ? 'bg-success text-[var(--ds-bg-app)]'
                      : 'border-[1.5px] border-[var(--ds-border-input)] text-transparent')
                  }
                >
                  ✓
                </span>
                <Avatar src={r.profiles?.avatar_url ?? null} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">
                    {r.profiles?.nombre ?? '—'}
                  </span>
                  <span
                    className={
                      'mt-[2px] block text-sm-lo font-bold tracking-[0.06em] uppercase ' +
                      (r.pagado ? 'text-success' : 'text-[var(--ds-warning-deep)]')
                    }
                  >
                    {r.pagado ? t('junta.payments.paid') : t('junta.payments.pending')}
                  </span>
                </span>
                <span
                  className={
                    'flex-none text-right text-lg font-extrabold tabular-nums ' +
                    (r.pagado ? 'text-success' : 'text-fg-dim')
                  }
                >
                  {r.pagado ? (each ?? '✓') : '—'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className={`pt-7 text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty] ${GUTTER}`}>
        {t('junta.payments.chaseThem')}
      </p>

      {toggle.isError ? (
        <p role="alert" className={`pt-4 text-md font-bold text-error ${GUTTER}`}>
          {t(errorKey(toggle.error))}
        </p>
      ) : null}
    </>
  )
}

/**
 * Els qui han pagat, i —amb `head`— també la capçalera que hi va a sobre.
 *
 * Són dos estats de càrrega diferents amb la mateixa silueta a sota: el de
 * fora espera l'esdeveniment i encara no sap ni el títol; el de dins ja el té
 * i només li falten els assistents. Un sol component amb un interruptor, i no
 * dos que es poden separar.
 */
function PaidSkeleton({ head = false }: { readonly head?: boolean }) {
  return (
    <Skeleton>
      {head ? (
        <div className={`pt-8 ${GUTTER}`}>
          <SkeletonBar w="w-[72%]" h="h-[38px]" />
          <div className="mt-7 flex items-end gap-7">
            <div>
              <SkeletonBar w="w-[54px]" h="h-[51px]" />
              <SkeletonBar w="w-[80px]" h="h-[12px]" className="mt-1" />
            </div>
            <div className="flex-1 pb-2">
              <SkeletonBar w="w-[45%]" h="h-[20px]" />
              <SkeletonBar w="w-[70%]" h="h-[12px]" className="mt-1" />
            </div>
          </div>
          <SkeletonBar w="w-full" h="h-[62px]" className="mt-8" />
        </div>
      ) : null}

      <div className="mt-10">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex min-h-[56px] items-center gap-4 border-b border-surface-4 px-[var(--ds-gutter)] py-[11px]"
          >
            <SkeletonBar w="w-[26px]" h="h-[26px]" className="flex-none rounded-full" />
            <SkeletonBar w="w-[36px]" h="h-[36px]" className="flex-none rounded-round" />
            <div className="min-w-0 flex-1">
              <SkeletonBar w="w-[58%]" h="h-[15px]" />
              <SkeletonBar w="w-[34%]" h="h-[10px]" className="mt-[2px]" />
            </div>
            <SkeletonBar w="w-[42px]" h="h-[18px]" className="flex-none" />
          </div>
        ))}
      </div>
    </Skeleton>
  )
}

/** Qui la porta: cara amb anella, nom, escola, i el xip del càrrec. */

/**
 * Qui la porta, en una línia.
 *
 * Aquí hi havia el bloc sencer: la llista d'admins, el cercador de socis i
 * l'únic botó de tota l'app que sabia nomenar algú. Els rols i els diners no
 * tenen res a veure —hi eren junts perquè les dues coses les fa la junta i
 * cabien a la mateixa pantalla— i el resultat era que per nomenar un admin
 * calia passar per la llista de qui ha pagat.
 *
 * Es queda l'enllaç, i no res, perquè és on la gent ho ha après a buscar.
 */
function WhoRuns() {
  const { t } = useTranslation()

  return (
    <section className="mt-14 border-t border-surface-5 pt-9 lg:mt-0 lg:border-t-0">
      <div className={GUTTER}>
        <h2 className="display text-d-sm leading-none tracking-[-0.045em]">
          {t('junta.payments.whoRuns')}
        </h2>
        <Link
          to="/junta/rols"
          className="mt-7 flex items-center gap-3 border-b border-surface-4 py-[15px] no-underline"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-fg">{t('junta.roles.title')}</span>
            <span className="mt-[3px] block text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
              {t('junta.roles.rowSub')}
            </span>
          </span>
          <span aria-hidden="true" className="flex-none text-2xl text-brand-accent">
            ›
          </span>
        </Link>
      </div>
    </section>
  )
}
