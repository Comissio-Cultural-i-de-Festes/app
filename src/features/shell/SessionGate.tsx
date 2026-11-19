import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PocketQr } from '@/features/qr/PocketQr'
import { Button } from '@/ui/Button/Button'

import { GateUnreachable } from './Gate'

/**
 * La porta de la sessió quan no es pot obrir, amb l'única cosa que encara es
 * pot fer: ensenyar el QR desat.
 *
 * Aquesta pantalla surt sobretot a qui ha tingut el mòbil tancat més d'una
 * hora i l'obre sense cobertura, que a la casa rural vol dir a la porta. Dir-li
 * «sense connexió» i prou el deixava sense el codi que porta a la butxaca.
 */
export function SessionGate({
  message,
  onRetry,
}: {
  readonly message: string
  readonly onRetry: () => void
}) {
  const { t } = useTranslation()
  const [showing, setShowing] = useState(false)

  if (showing) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-9 bg-app px-[var(--ds-gutter)]">
        <PocketQr />
        <button
          type="button"
          onClick={() => {
            setShowing(false)
          }}
          className="min-h-[44px] px-4 text-md font-bold text-brand-label"
        >
          {t('qr.pocketBack')}
        </button>
      </main>
    )
  }

  return (
    <GateUnreachable message={message} onRetry={onRetry}>
      <div className="mt-6 w-full max-w-[340px]">
        <Button
          variant="secondary"
          onClick={() => {
            setShowing(true)
          }}
        >
          {t('qr.fromPocket')}
        </Button>
      </div>
    </GateUnreachable>
  )
}
