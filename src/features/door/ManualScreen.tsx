import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { SCAN_PRESENTATION } from '@/design/states'
import { eventKeys, fetchEvent } from '@/features/event/api'
import { Avatar } from '@/ui/Avatar/Avatar'

import {
  type DoorOutcome,
  type RosterRow,
  doorKeys,
  fetchRoster,
  outcomeFromFailure,
  scan,
} from './api'
import { useQueue } from './useQueue'

/**
 * Checking somebody in by name.
 *
 * The way out when a phone is flat, a QR will not read, or somebody has turned
 * up who never opened the app. It goes through the same `check_in`, so a
 * manual entry and a scanned one are the same row with the same points and the
 * same audit trail.
 *
 * One trap worth naming: `checkin_roster` returns zero rows to somebody who is
 * not on the junta rather than an error, so an empty list here can mean "you
 * are not allowed to ask". The screen says "nobody is coming" only when the
 * request actually succeeded and the event genuinely has nobody.
 */

export function ManualScreen() {
  const { t } = useTranslation()
  const { eventId } = useParams()
  const id = eventId ?? ''
  const [query, setQuery] = useState('')
  const [done, setDone] = useState<Record<string, DoorOutcome>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const { queued, online, refresh: refreshQueue } = useQueue()

  const event = useQuery({
    queryKey: eventKeys.one(id),
    queryFn: () => fetchEvent(id),
    enabled: id !== '',
  })
  const roster = useQuery({
    queryKey: doorKeys.roster(id),
    queryFn: () => fetchRoster(id),
    enabled: id !== '',
  })

  const needle = query.trim().toLowerCase()
  const rows = roster.data ?? []
  const shown =
    needle === ''
      ? rows.filter((r) => r.estado === 'si' || r.checked_in)
      : rows.filter((r) => r.nombre.toLowerCase().includes(needle))

  function letIn(row: RosterRow) {
    setBusy(row.user_id)
    void scan({
      clientRequestId: crypto.randomUUID(),
      eventId: id,
      qrToken: null,
      userId: row.user_id,
    })
      .then((result) => {
        setDone((previous) => ({ ...previous, [row.user_id]: { kind: 'sent', result } }))
        void roster.refetch()
      })
      .catch(() => {
        setDone((previous) => ({ ...previous, [row.user_id]: outcomeFromFailure() }))
      })
      .finally(() => {
        setBusy(null)
        refreshQueue()
      })
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[var(--ds-bg-door)]">
      <header className="sticky top-0 z-20 border-b border-surface-5 bg-[var(--ds-bg-door)] px-[var(--ds-gutter)] pt-[calc(var(--ds-safe-top)+8px)] pb-6">
        <div className="flex items-center justify-between gap-6">
          <Link
            to={`/junta/escaner/${id}`}
            className="-ml-4 flex min-h-[56px] items-center gap-1 px-4 text-md font-bold text-fg-muted no-underline"
          >
            <span aria-hidden="true" className="text-lg">
              ‹
            </span>
            {t('door.backToScanner')}
          </Link>
          <p className="min-w-0 truncate text-xs font-extrabold tracking-[0.14em] text-fg-muted uppercase">
            {event.data?.titulo ?? ''}
          </p>
        </div>

        {queued === 0 && online ? null : (
          <p className="mt-4 flex items-center gap-3 text-sm font-bold text-[var(--ds-warning-deep)]">
            <span
              aria-hidden="true"
              className="size-[8px] flex-none animate-pulse rounded-full bg-[var(--ds-warning-deep)]"
            />
            {online
              ? t('door.queued', { count: queued })
              : t('door.queuedOffline', { count: queued })}
          </p>
        )}

        <h1 className="display mt-4 text-[30px] tracking-[-0.045em] [text-wrap:balance]">
          {t('door.manualTitle')}
        </h1>

        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
          }}
          // Bigger than anywhere else in the app on purpose: this is typed
          // with one thumb, standing up, with people waiting.
          className="mt-6 min-h-[54px] w-full border-[1.5px] border-surface-7 bg-surface-1 px-7 py-6 text-xl font-semibold text-fg outline-none placeholder:font-medium placeholder:text-fg-dim"
          placeholder={t('door.searchName')}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </header>

      {roster.isPending ? (
        <p className="px-[var(--ds-gutter)] pt-10 text-fg-muted">{t('state.loading')}</p>
      ) : roster.isError ? (
        <p role="alert" className="px-[var(--ds-gutter)] pt-10 text-md font-bold text-error">
          {t('errors.generic')}
        </p>
      ) : rows.length === 0 ? (
        // checkin_roster hands back zero rows rather than an error to anybody
        // who is not on the junta, and it otherwise returns EVERY active
        // member. So an empty roster is not an empty association; it is a
        // refusal wearing the same clothes as a success.
        <p
          role="alert"
          className="px-[var(--ds-gutter)] pt-10 text-md font-bold text-error [text-wrap:pretty]"
        >
          {t('door.rosterRefused')}
        </p>
      ) : rows.length === 0 ? (
        // checkin_roster hands back zero rows rather than an error to anybody
        // who is not on the junta, and it otherwise returns EVERY active
        // member. So an empty roster is not an empty association; it is a
        // refusal wearing the same clothes as a success.
        <p
          role="alert"
          className="px-[var(--ds-gutter)] pt-10 text-md font-bold text-error [text-wrap:pretty]"
        >
          {t('door.rosterRefused')}
        </p>
      ) : rows.length === 0 ? (
        // checkin_roster hands back zero rows rather than an error to anybody
        // who is not on the junta, and it otherwise returns EVERY active
        // member. So an empty roster is not an empty association; it is a
        // refusal wearing the same clothes as a success.
        <p
          role="alert"
          className="px-[var(--ds-gutter)] pt-10 text-md font-bold text-error [text-wrap:pretty]"
        >
          {t('door.rosterRefused')}
        </p>
      ) : rows.length === 0 ? (
        // checkin_roster hands back zero rows rather than an error to anybody
        // who is not on the junta, and it otherwise returns EVERY active
        // member. So an empty roster is not an empty association; it is a
        // refusal wearing the same clothes as a success.
        <p
          role="alert"
          className="px-[var(--ds-gutter)] pt-10 text-md font-bold text-error [text-wrap:pretty]"
        >
          {t('door.rosterRefused')}
        </p>
      ) : shown.length === 0 ? (
        <p className="px-[var(--ds-gutter)] pt-10 text-md text-fg-muted [text-wrap:pretty]">
          {needle === '' ? t('door.nobodyExpected') : t('door.noMatch')}
        </p>
      ) : (
        <ul className="pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
          {shown.map((row) => {
            const outcome = done[row.user_id]
            // Queued counts as in. The person is past the door; only the row
            // is late, and telling the junta to tap again would queue it twice.
            const already = row.checked_in || outcome?.kind === 'sent' || outcome?.kind === 'queued'
            return (
              <li key={row.user_id}>
                <button
                  type="button"
                  disabled={busy !== null || already}
                  onClick={() => {
                    letIn(row)
                  }}
                  className={
                    'flex min-h-[64px] w-full items-center gap-5 border-b border-surface-4 ' +
                    'px-[var(--ds-gutter)] py-6 text-left ' +
                    (already ? 'bg-[var(--ds-bg-paid)]' : '')
                  }
                >
                  <Avatar src={null} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-semibold">{row.nombre}</span>
                    <span className="mt-[2px] block text-[12.5px] text-[var(--ds-text-muted-lo)]">
                      {[
                        row.escola === null ? null : t(`escolaShort.${row.escola}`),
                        row.curs === null ? null : t(`onboarding.year.${row.curs}`),
                        row.pagado === true ? t('junta.payments.paid') : null,
                      ]
                        .filter((s): s is string => s !== null)
                        .join(' · ')}
                    </span>
                  </span>
                  <span
                    className={
                      'flex-none text-md font-bold ' +
                      (already ? 'text-success' : 'text-brand-label')
                    }
                  >
                    {outcome === undefined
                      ? already
                        ? t('door.alreadyIn')
                        : t('door.letIn')
                      : outcome.kind === 'sent'
                        ? t(SCAN_PRESENTATION[outcome.result.status].messageKey)
                        : outcome.kind === 'queued'
                          ? t('scanner.queued')
                          : t('scanner.error')}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
