import { useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { toneVar } from '@/design/states'
import { eventKeys, fetchEvent } from '@/features/event/api'
import { errorKey } from '@/lib/errors'
import { Avatar } from '@/ui/Avatar/Avatar'

import {
  type DoorOutcome,
  type RosterRow,
  doorKeys,
  fetchRoster,
  outcomeFromFailure,
  presentationOf,
  scan,
} from './api'
import { ScanGlyph } from './icons'
import { useQueue } from './useQueue'
import { type Undo, undoNoteKey, useUndo } from './useUndo'

/**
 * Checking somebody in by name.
 *
 * The way out when a phone is flat, a QR will not read, or somebody has turned
 * up who never opened the app. It goes through the same `check_in`, so a
 * manual entry and a scanned one are the same row with the same points and the
 * same audit trail.
 *
 * This is also where a mistake is most likely: a scan is the right person by
 * construction, and a name in a list of two hundred is one thumb-width from
 * the wrong one. So the last person let in stays on screen with a way back,
 * which is the strip the prototype draws above the list.
 *
 * One trap worth naming: `checkin_roster` returns zero rows to somebody who is
 * not on the junta rather than an error, so an empty list here can mean "you
 * are not allowed to ask". The screen says "nobody is coming" only when the
 * request actually succeeded and the event genuinely has nobody.
 */

interface LastIn {
  readonly userId: string
  readonly nombre: string
  readonly outcome: DoorOutcome
}

export function ManualScreen() {
  const { t } = useTranslation()
  const { eventId } = useParams()
  const id = eventId ?? ''
  const [query, setQuery] = useState('')
  const [done, setDone] = useState<Record<string, DoorOutcome>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [last, setLast] = useState<LastIn | null>(null)
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

  // Putting the row back within reach is half of undoing. The strip can say
  // "fet enrere" all it likes; if the name below it still reads "Ja és dins"
  // the junta cannot let the right person in.
  const afterUndo = useCallback(() => {
    if (last !== null) {
      const userId = last.userId
      setDone((previous) => {
        const next = { ...previous }
        delete next[userId]
        return next
      })
    }
    void roster.refetch()
    refreshQueue()
  }, [last, roster, refreshQueue])
  const undoLast = useUndo(last?.outcome ?? null, afterUndo)

  function letIn(row: RosterRow) {
    setBusy(row.user_id)
    const request = {
      clientRequestId: crypto.randomUUID(),
      eventId: id,
      qrToken: null,
      userId: row.user_id,
    }
    void scan(request)
      .then((result) => {
        const outcome: DoorOutcome = { kind: 'sent', request, result }
        setDone((previous) => ({ ...previous, [row.user_id]: outcome }))
        setLast({ userId: row.user_id, nombre: row.nombre, outcome })
        void roster.refetch()
      })
      .catch(() => {
        const outcome = outcomeFromFailure(request)
        setDone((previous) => ({ ...previous, [row.user_id]: outcome }))
        setLast({ userId: row.user_id, nombre: row.nombre, outcome })
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
          <p className="eyebrow min-w-0 truncate text-fg-muted">{event.data?.titulo ?? ''}</p>
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

        <h1 className="display mt-4 text-d-s tracking-[-0.045em] [text-wrap:balance]">
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
          type="search"
          enterKeyHint="search"
          // El placeholder desapareix en escriure: per a un lector de pantalla
          // el camp es quedava sense nom just quan s'està fent servir.
          aria-label={t('door.searchName')}
          placeholder={t('door.searchName')}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </header>

      {last === null ? null : <LastInStrip last={last} undo={undoLast} />}

      {roster.isPending ? (
        <p className="px-[var(--ds-gutter)] pt-10 text-fg-muted">{t('state.loading')}</p>
      ) : roster.isError ? (
        <p role="alert" className="px-[var(--ds-gutter)] pt-10 text-md font-bold text-error">
          {t(errorKey(roster.error))}
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
        <ul className="pb-[calc(var(--ds-safe-bottom)+24px)]">
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
                      : t(presentationOf(outcome).messageKey)}
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

/**
 * The last person let in, and the way back.
 *
 * Louder than the rows below it — `--ds-bg-live` rather than the paid row's
 * tint — for the reason that token exists: this is a state, not a row in a
 * list, and it has about four seconds to be noticed before the next name is
 * tapped.
 */
function LastInStrip({ last, undo }: { readonly last: LastIn; readonly undo: Undo }) {
  const { t } = useTranslation()
  const shown = presentationOf(last.outcome)
  const noteKey = undoNoteKey(undo.state, undo.error)

  // Once it is taken back the strip goes grey, because a green tick above
  // "fet enrere" reads as a check-in from across the room.
  const gone = undo.state === 'undone' || undo.state === 'dropped'
  const tone = gone ? 'var(--ds-text-muted)' : toneVar(shown.tone)

  const points = last.outcome.kind === 'sent' ? (last.outcome.result.points_awarded ?? 0) : 0
  const detail = [t(shown.messageKey), points > 0 ? t('units.points', { count: points }) : null]
    .filter((s): s is string => s !== null)
    .join(' · ')

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ borderColor: tone }}
      className={
        'mx-[var(--ds-gutter)] mt-6 flex items-center gap-6 border-2 px-6 py-6 ' +
        (gone ? 'bg-surface-1' : 'bg-[var(--ds-bg-live)]')
      }
    >
      <span
        aria-hidden="true"
        style={{ backgroundColor: tone, color: 'var(--ds-on-state)' }}
        className="grid size-[40px] flex-none place-items-center rounded-full"
      >
        <ScanGlyph icon={shown.icon} size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-[var(--ds-text-muted-lo)]">{t('door.lastIn')}</p>
        <p className="mt-2 truncate text-lg font-bold">{last.nombre}</p>
        <p className="mt-1 text-[13px] font-semibold" style={{ color: tone }}>
          {noteKey === null ? detail : t(noteKey, { nombre: last.nombre })}
        </p>
      </div>
      {undo.run === null ? null : (
        <button
          type="button"
          onClick={undo.run}
          disabled={undo.state === 'busy'}
          style={{ color: tone }}
          className="-mr-3 flex min-h-[44px] flex-none items-center px-3 text-[13px] font-extrabold tracking-[0.06em] uppercase"
        >
          {undo.state === 'busy' ? t('door.undoing') : t('actions.undo')}
        </button>
      )}
    </div>
  )
}
