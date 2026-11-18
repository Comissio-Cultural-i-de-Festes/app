import { useTranslation } from 'react-i18next'

import { errorKey } from '@/lib/errors'
import { useStalled } from '@/lib/useAvailability'

/**
 * La línia sota un botó quan el que s'ha enviat no ha arribat.
 *
 * Sense xarxa, React Query no envia la mutació ni la fa fallar: la posa en
 * pausa, i el botó es queda ocupat sense dir res. Tres casos, tres frases:
 *
 * - en pausa: esperant la xarxa, en ambre i com a `status` —no ha anat res
 *   malament i s'enviarà sola mentre l'app sigui oberta—, igual que els
 *   formularis de la junta;
 * - a l'aire massa estona: la xarxa diu que hi és i no contesta;
 * - fallada sense xarxa: passa en obrir l'app ja sense cobertura, quan React
 *   Query encara no sap que no n'hi ha i la crida surt i peta. «Necessites
 *   connexió per veure això» és la frase de les pantalles, no la d'un botó.
 *
 * Les frases per defecte no diuen què s'envia; qui en té una de pròpia, com el
 * «sí» d'un esdeveniment, les passa.
 */

export interface SendWords {
  readonly paused: string
  readonly slow: string
  readonly offline: string
}

const SEND_WORDS: SendWords = {
  paused: 'errors.sendPaused',
  slow: 'errors.sendSlow',
  offline: 'errors.sendOffline',
}

export function SendNote({
  send,
  words = SEND_WORDS,
  className = '',
}: {
  readonly send: {
    readonly isPending: boolean
    readonly isPaused: boolean
    readonly error: Error | null
  }
  readonly words?: SendWords
  readonly className?: string
}) {
  const { t } = useTranslation()
  const slow = useStalled(send.isPending && !send.isPaused)

  if (send.isPaused || slow) {
    return (
      <p role="status" className={`text-sm font-bold text-warning [text-wrap:pretty] ${className}`}>
        {t(send.isPaused ? words.paused : words.slow)}
      </p>
    )
  }

  if (send.error === null) return null

  const key = errorKey(send.error)
  return (
    <p role="alert" className={`text-md font-bold text-error [text-wrap:pretty] ${className}`}>
      {t(key === 'errors.offline' ? words.offline : key)}
    </p>
  )
}
