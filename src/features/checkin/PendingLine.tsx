import { useTranslation } from 'react-i18next'

import { useCheckinPending } from './useCheckinPending'

/**
 * «2 fitxatges pendents d'enviar.»
 *
 * El punt ambre pulsant que la porta i les idees ja fan servir, ara per al
 * membre. Sense això, la cua només es veia dins del bloc de fitxatge i mentre
 * no en sorties: tancaves l'app a la festa, l'obries l'endemà, i no en quedava
 * cap rastre —ni de la cua, ni que els punts encara no eren teus.
 *
 * Desapareix quan la cua és buida, i per tant no diu res els 364 dies que no
 * hi ha res a dir.
 */

export function PendingLine() {
  const { t } = useTranslation()
  const { queued, online } = useCheckinPending()

  if (queued === 0) return null

  return (
    <p
      role="status"
      className="flex items-center gap-3 text-sm font-bold text-[var(--ds-warning-deep)]"
    >
      <span
        aria-hidden="true"
        className="size-[8px] flex-none animate-pulse rounded-full bg-[var(--ds-warning-deep)]"
      />
      {online
        ? t('checkin.pending', { count: queued })
        : t('checkin.pendingOffline', { count: queued })}
    </p>
  )
}
