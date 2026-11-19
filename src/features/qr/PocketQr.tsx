import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { storedUser } from '@/features/session/storedSession'

import { QrCard } from './QrCard'
import { readCachedToken } from './api'

/**
 * El QR desat, sense sessió oberta.
 *
 * Per a la porta que no ha pogut obrir la sessió: mòbil tancat més d'una hora,
 * testimoni caducat, cap cobertura per renovar-lo, i la persona plantada a la
 * porta d'una casa rural. El codi ja era al mòbil —la precàrrega el desa en
 * entrar— i l'únic que faltava era saber de qui és, que la sessió desada ho
 * diu encara que no es pugui fer servir.
 *
 * Sense codi desat ho diu clar, i diu també l'única sortida que hi ha.
 */
export function PocketQr() {
  const { t } = useTranslation()
  const [pocket] = useState(() => {
    const user = storedUser()
    const token = user === null ? null : readCachedToken(user.id)
    return token === null || user === null ? null : { token, name: user.name ?? '' }
  })

  if (pocket === null) {
    return (
      <p
        role="status"
        className="max-w-[320px] text-center text-md text-fg-secondary [text-wrap:pretty]"
      >
        {t('qr.noneSaved')}
      </p>
    )
  }

  return (
    <>
      <QrCard token={pocket.token} name={pocket.name} />
      <p className="max-w-[300px] text-center text-md text-fg-muted [text-wrap:pretty]">
        {t('qr.fallback')}
      </p>
    </>
  )
}
