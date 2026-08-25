import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { formatMoney, formatPrice } from '@/features/event/api'
import { horizonIso } from '@/features/home/api'
import { useMyProfile } from '@/features/session/useMyProfile'
import { formatDayMonth } from '@/i18n/format'
import { INTL_LOCALE, toLocale } from '@/i18n/locales'
import type { MemberRole } from '@/lib/model'
import { errorKey } from '@/lib/errors'
import type { EventRow } from '@/lib/schema'
import { Avatar } from '@/ui/Avatar/Avatar'

import { JuntaHeader } from './JuntaHeader'
import { fetchJuntaEvents, juntaEventKeys } from './eventsApi'
import {
  type AdminRow,
  type AttendeeRow,
  fetchAdmins,
  fetchAttendees,
  fetchMembers,
  type Decision,
  decideRequest,
  fetchQueue,
  fetchRequests,
  letInFromQueue,
  paymentKeys,
  setPaid,
  setRole,
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
    <main className="min-h-dvh bg-app pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
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
            <p className={`pt-10 text-fg-muted ${GUTTER}`}>{t('state.loading')}</p>
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
              failed={attendees.isError}
            />
          )}
          {event === null ? null : <Requests eventId={event.id} />}
          {event === null ? null : <Queue eventId={event.id} />}
        </div>
        <Admins />
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
      <h2 className="display text-[26px] leading-none tracking-[-0.045em]">
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
      <h2 className="display text-[26px] leading-none tracking-[-0.045em]">
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
  failed,
}: {
  readonly eventId: string
  readonly priceCents: number
  readonly rows: readonly AttendeeRow[]
  readonly loading: boolean
  readonly failed: boolean
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
            <p className="display text-[54px] leading-[0.95] tracking-[-0.055em] tabular-nums">
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

        <p className="mt-8 border-l-[3px] border-surface-7 bg-surface-1 px-7 py-6 text-md font-medium text-fg-secondary [text-wrap:pretty]">
          {t('junta.payments.bizum')}
        </p>
      </section>

      {loading ? (
        <p className={`pt-10 text-fg-muted ${GUTTER}`}>{t('state.loading')}</p>
      ) : failed ? (
        <p role="alert" className={`pt-10 text-md font-bold text-error ${GUTTER}`}>
          {t('errors.generic')}
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
                      'mt-[2px] block text-[12.5px] font-bold tracking-[0.06em] uppercase ' +
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

      <p
        className={`pt-7 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty] ${GUTTER}`}
      >
        {t('junta.payments.chaseThem')}
      </p>

      {toggle.isError ? (
        <p role="alert" className={`pt-4 text-md font-bold text-error ${GUTTER}`}>
          {t('errors.generic')}
        </p>
      ) : null}
    </>
  )
}

/**
 * Naming the next committee.
 *
 * An admin can name another admin. The brief asks for the handover to be one
 * tap in June rather than a message to whoever set the thing up, and the trail
 * in audit_log is what covers the risk. `owner` is different — it is
 * infrastructure, only an owner can grant or remove it, and the database says
 * so whatever this screen draws.
 */
function Admins() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const { data: me } = useMyProfile()
  const [picking, setPicking] = useState(false)

  const admins = useQuery({ queryKey: paymentKeys.admins(), queryFn: fetchAdmins })
  const members = useQuery({
    queryKey: paymentKeys.members(),
    queryFn: fetchMembers,
    enabled: picking,
  })

  const name = useMutation({
    mutationFn: ({ id, role }: { id: string; role: MemberRole }) => setRole(id, role),
    onSuccess: async () => {
      setPicking(false)
      await client.invalidateQueries({ queryKey: paymentKeys.admins() })
      await client.invalidateQueries({ queryKey: paymentKeys.members() })
    },
  })

  return (
    <section className="mt-14 border-t border-surface-5 pt-9 lg:mt-0 lg:border-t-0">
      <div className={GUTTER}>
        <h2 className="display text-[26px] leading-none tracking-[-0.045em]">
          {t('junta.payments.whoRuns')}
        </h2>
        <p className="mt-5 text-md font-medium text-fg-secondary [text-wrap:pretty]">
          {t('junta.payments.handover')}
        </p>
      </div>

      {admins.isPending ? (
        <p className={`pt-8 text-fg-muted ${GUTTER}`}>{t('state.loading')}</p>
      ) : admins.isError ? (
        <p role="alert" className={`pt-8 text-md font-bold text-error ${GUTTER}`}>
          {t(errorKey(admins.error))}
        </p>
      ) : null}

      <ul className="mt-7">
        {admins.data?.map((a) => (
          <li
            key={a.id}
            className="flex min-h-[56px] items-center gap-4 border-b border-surface-4 px-[var(--ds-gutter)] py-6"
          >
            <Avatar src={a.avatar_url} size={38} ring={a.id === me?.id} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-bold">{a.nombre}</span>
              <span className="mt-[2px] block text-[12.5px] font-medium text-fg-muted">
                {a.id === me?.id ? `${t('junta.payments.you')} · ` : ''}
                {a.escola === null ? t('junta.invites.noSchool') : t(`escola.${a.escola}`)}
              </span>
            </span>
            <RoleTag role={a.role} />
          </li>
        ))}
      </ul>

      <div className={`pt-8 ${GUTTER}`}>
        {picking ? (
          <MemberPicker
            rows={members.data ?? []}
            loading={members.isPending}
            busy={name.isPending}
            onPick={(id) => {
              name.mutate({ id, role: 'admin' })
            }}
            onCancel={() => {
              setPicking(false)
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setPicking(true)
            }}
            className="flex min-h-[54px] w-full items-center justify-center border-[1.5px] border-dashed border-[var(--ds-border-input)] px-7 py-6 text-lg font-bold text-fg [text-wrap:balance]"
          >
            {t('junta.payments.nameAdmin')}
          </button>
        )}
        <p className="mt-5 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
          {t('junta.payments.adminCan')}
        </p>
        {name.isError ? (
          <p role="alert" className="mt-4 text-md font-bold text-error">
            {t('errors.generic')}
          </p>
        ) : null}
      </div>
    </section>
  )
}

function RoleTag({ role }: { readonly role: MemberRole }) {
  const { t } = useTranslation()
  const brand = role === 'owner'
  return (
    <span
      className={
        'flex-none px-[7px] py-[4px] text-2xs font-extrabold tracking-[0.1em] uppercase ' +
        (brand ? 'bg-brand-cta text-on-brand' : 'bg-surface-6 text-fg-secondary')
      }
    >
      {t(`junta.payments.role.${role}`)}
    </span>
  )
}

function MemberPicker({
  rows,
  loading,
  busy,
  onPick,
  onCancel,
}: {
  readonly rows: readonly AdminRow[]
  readonly loading: boolean
  readonly busy: boolean
  readonly onPick: (id: string) => void
  readonly onCancel: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const needle = query.trim().toLowerCase()
  const shown = needle === '' ? rows : rows.filter((r) => r.nombre.toLowerCase().includes(needle))

  return (
    <div className="border-[1.5px] border-surface-7 bg-surface-1">
      <div className="flex items-center gap-4 border-b border-surface-5 p-6">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
          }}
          type="search"
          enterKeyHint="search"
          aria-label={t('junta.payments.searchMember')}
          placeholder={t('junta.payments.searchMember')}
          className="min-h-[44px] min-w-0 flex-1 bg-transparent text-lg font-semibold text-fg outline-none placeholder:font-medium placeholder:text-fg-faint"
        />
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] flex-none px-2 text-md font-bold text-fg-muted"
        >
          {t('actions.cancel')}
        </button>
      </div>

      {loading ? (
        <p className="p-7 text-fg-muted">{t('state.loading')}</p>
      ) : shown.length === 0 ? (
        <p className="p-7 text-md text-fg-muted [text-wrap:pretty]">
          {t('junta.payments.noMembers')}
        </p>
      ) : (
        <ul className="max-h-[320px] overflow-y-auto">
          {shown.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onPick(r.id)
                }}
                className="flex min-h-[52px] w-full items-center gap-4 border-b border-surface-4 px-6 py-5 text-left"
              >
                <Avatar src={r.avatar_url} size={32} />
                <span className="min-w-0 flex-1 truncate text-base font-semibold">{r.nombre}</span>
                <span className="flex-none text-md font-bold text-brand-label">
                  {t('junta.payments.makeAdmin')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
