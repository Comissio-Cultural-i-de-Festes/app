import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type CheckInStatus, SCAN_PRESENTATION } from '@/design/states'
import { formatTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import type { QueuedScan } from '@/lib/queue'

import { discardHeld, retryRefused } from './api'
import { statusWords } from './verdict'

/**
 * The scans a flush could not just rub out, still on the phone.
 *
 * Nobody saw their card. They were queued an hour ago with no signal, the
 * person walked in on the strength of "saved", and the answer came back to an
 * empty screen: a QR the server refused outright, or one it took and said
 * something about — not a member, not active, in without being signed up.
 * This list is what is left to say so, and it stays until somebody acts.
 *
 * EACH LINE SAYS WHO, as far as anybody knows. A name tapped on the manual
 * list carries its `userId`, and the roster the screen already has turns that
 * into a name. A QR is only a token until the server reads it, so its name is
 * whatever `check_in` answered with, if it answered at all; failing that, the
 * time is the only handle, and at a door it is a fair one. Without any of
 * this, "Descarta" was a button that threw away somebody nobody could name.
 *
 * Retrying is for the refused ones only. The answered ones landed, and the
 * same id would only replay the same answer.
 */
export function HeldScans({
  rows,
  names,
  priceCents,
  onChange,
  className = '',
}: {
  readonly rows: readonly QueuedScan[]
  /** `user_id` to name, from the roster. */
  readonly names: ReadonlyMap<string, string>
  /** Cèntims de l'esdeveniment, o null mentre no se sàpiga: `verdict.ts` en fa tres casos. */
  readonly priceCents: number | null
  readonly onChange: () => void
  readonly className?: string
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.language)
  const [busy, setBusy] = useState(false)

  if (rows.length === 0) return null

  const act = (work: () => Promise<unknown>) => {
    setBusy(true)
    void work().finally(() => {
      setBusy(false)
      onChange()
    })
  }

  const why = (row: QueuedScan): string => {
    const held = row.held
    if (held?.kind !== 'answered' || !(held.status in SCAN_PRESENTATION)) {
      return t('door.heldRefused')
    }
    const status = held.status as CheckInStatus
    return t(statusWords(SCAN_PRESENTATION[status], { status }, priceCents).headlineKey)
  }

  const who = (row: QueuedScan): string => {
    if (row.held?.kind === 'answered' && row.held.nombre !== null) return row.held.nombre
    if (row.userId !== null) return names.get(row.userId) ?? t('door.unknownPerson')
    return t('door.heldQr')
  }

  return (
    <div role="alert" className={`border-l-[3px] border-error ${className}`}>
      <p className="text-sm font-bold text-error [text-wrap:pretty]">
        {t('door.held', { count: rows.length })}
      </p>
      <ul className="mt-2">
        {rows.map((row) => (
          <li key={row.clientRequestId} className="flex items-center gap-4">
            <p className="min-w-0 flex-1 text-sm text-fg [text-wrap:pretty]">
              <span className="font-bold">{who(row)}</span>
              {' · '}
              {t('door.heldAt', { hora: formatTime(new Date(row.at), locale) })}
              {' · '}
              {why(row)}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                act(() => discardHeld(row.clientRequestId))
              }}
              className="min-h-[44px] flex-none px-2 text-sm font-bold text-fg-secondary disabled:opacity-50"
            >
              {t('door.heldDrop')}
            </button>
          </li>
        ))}
      </ul>
      {rows.some((row) => row.held?.kind === 'refused') ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            act(retryRefused)
          }}
          className="min-h-[44px] text-sm font-bold text-brand-label disabled:opacity-50"
        >
          {t('door.heldRetry')}
        </button>
      ) : null}
    </div>
  )
}
