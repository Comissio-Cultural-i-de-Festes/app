import { useTranslation } from 'react-i18next'

import { errorKey } from '@/lib/errors'
import { useStalled } from '@/lib/useAvailability'

/**
 * La línia sota el «sí» quan la resposta no ha arribat.
 *
 * Sense xarxa, React Query no envia la mutació ni la fa fallar: la posa en
 * pausa. El botó es quedava a «Actualitzant…», apagat, sense cap frase, i qui
 * tancava l'app pensant que ja estava perdia la resposta sense saber-ho. Tres
 * llocs diuen «sí» —la fitxa, l'Inici i la targeta de la revelació— i tots tres
 * ho feien igual.
 *
 * AVÍS, NO CUA. Una cua sobreviuria a tancar l'app, però `set_attendance` no és
 * idempotent sobre cap identificador de petició, i un «sí» que arriba hores
 * més tard pot trobar l'esdeveniment ple i acabar a la llista d'espera sense
 * que ningú ho hagi vist decidir. Fer-ho bé voldria dir una migració; dir-ho
 * clar no. La pausa ja l'envia sola quan torna la xarxa mentre l'app és oberta,
 * i és el que diu la frase.
 *
 * TRES CASOS, TRES FRASES:
 * - en pausa: esperant la xarxa, en ambre i com a `status` —no ha anat res
 *   malament—, igual que els formularis de la junta;
 * - a l'aire massa estona: la xarxa diu que hi és i no contesta;
 * - fallada sense xarxa: passa en obrir l'app ja sense cobertura, quan React
 *   Query encara no sap que no n'hi ha i la crida surt i peta. «Necessites
 *   connexió per veure això» és la frase de les pantalles, no la d'un botó.
 */
export function AnswerNote({
  answer,
  className = '',
}: {
  readonly answer: {
    readonly isPending: boolean
    readonly isPaused: boolean
    readonly error: Error | null
  }
  readonly className?: string
}) {
  const { t } = useTranslation()
  const slow = useStalled(answer.isPending && !answer.isPaused)

  if (answer.isPaused || slow) {
    return (
      <p role="status" className={`text-sm font-bold text-warning [text-wrap:pretty] ${className}`}>
        {t(answer.isPaused ? 'event.ask.paused' : 'event.ask.slow')}
      </p>
    )
  }

  if (answer.error === null) return null

  const key = errorKey(answer.error)
  return (
    <p role="alert" className={`text-md font-bold text-error [text-wrap:pretty] ${className}`}>
      {t(key === 'errors.offline' ? 'event.ask.offline' : key)}
    </p>
  )
}
