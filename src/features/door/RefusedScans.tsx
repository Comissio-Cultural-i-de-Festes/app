import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { discardRefused, retryRefused } from './api'

/**
 * The scans the server turned down, still on the phone.
 *
 * Nobody sees the card of a scan refused during a flush: it was queued an
 * hour ago with no signal, and the person walked in on the strength of
 * "saved". This line is what is left to say that they are not checked in.
 * It stays until somebody acts on it, because nothing else will.
 *
 * Two ways out, not one. "Torna-hi" is for the refusal that was about the
 * phone and not the scan — a session that lapsed, a role restored — and costs
 * one request each if it was not. "Descarta" is for after the junta has dealt
 * with it by hand; until then dropping them would erase the only record.
 */
export function RefusedScans({
  count,
  onChange,
  className = '',
}: {
  readonly count: number
  readonly onChange: () => void
  readonly className?: string
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  if (count === 0) return null

  const act = (work: () => Promise<unknown>) => {
    setBusy(true)
    void work().finally(() => {
      setBusy(false)
      onChange()
    })
  }

  return (
    <div role="alert" className={`border-l-[3px] border-error ${className}`}>
      <p className="text-sm font-bold text-error [text-wrap:pretty]">
        {t('door.refused', { count })}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-8">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            act(retryRefused)
          }}
          className="min-h-[44px] text-sm font-bold text-brand-label disabled:opacity-50"
        >
          {t('door.refusedRetry')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            act(discardRefused)
          }}
          className="min-h-[44px] text-sm font-bold text-fg-secondary disabled:opacity-50"
        >
          {t('door.refusedDrop')}
        </button>
      </div>
    </div>
  )
}
