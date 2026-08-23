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
import { Avatar } from '@/ui/Avatar/Avatar'

import { JuntaHeader } from './JuntaHeader'
import { fetchJuntaEvents, juntaEventKeys } from './eventsApi'
import {
  type AdminRow,
  type AttendeeRow,
  fetchAdmins,
  fetchAttendees,
  fetchMembers,
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
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const navigate = useNavigate()
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
        label={t('junta.back')}
        aside={
          list.length === 0 ? null : (
            <label className="flex min-h-[44px] min-w-0 items-center">
              <span className="sr-only">{t('junta.payments.pickEvent')}</span>
              <select
                value={chosen ?? ''}
                onChange={(e) => {
                  void navigate(`/junta/pagaments/${e.target.value}`, { replace: true })
                }}
                className="max-w-[220px] truncate bg-transparent text-right text-xs font-extrabold tracking-[0.14em] text-fg-muted uppercase"
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
      />

      {events.isPending ? (
        <p className={`pt-10 text-fg-muted ${GUTTER}`}>{t('state.loading')}</p>
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
        />
      )}

      <Admins />
    </main>
  )
}

function PaidList({
  eventId,
  priceCents,
  rows,
  loading,
}: {
  readonly eventId: string
  readonly priceCents: number
  readonly rows: readonly AttendeeRow[]
  readonly loading: boolean
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
                    (r.pagado ? 'text-success' : 'text-fg-faint')
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
    <section className="mt-14 border-t border-surface-5 pt-9">
      <div className={GUTTER}>
        <h2 className="display text-[26px] leading-none tracking-[-0.045em]">
          {t('junta.payments.whoRuns')}
        </h2>
        <p className="mt-5 text-md font-medium text-fg-secondary [text-wrap:pretty]">
          {t('junta.payments.handover')}
        </p>
      </div>

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
        (brand ? 'bg-brand text-on-brand' : 'bg-surface-6 text-fg-secondary')
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
