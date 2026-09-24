import { useTranslation } from 'react-i18next'

import { clauGravetat, clauQueFer } from './avisTipus'
import { Field } from './formBits'

/**
 * Triar la gravetat d'un avís: tres botons, la suggerida escrita a sota, i què
 * es fa amb la que està triada.
 *
 * UN COMPONENT PERQUÈ EL FAN SERVIR DOS FORMULARIS —el d'un soci i el d'un avís
 * pendent— i han de ser el mateix gest. Qui el fa servir porta l'estat i la
 * regla de precàrrega, que és seva: mentre ningú no l'hagi tocat, canviar de
 * tipus torna a posar la suggerida.
 *
 * TRES BOTONS I NO UN DESPLEGABLE: són tres opcions que s'han de veure alhora,
 * i la diferència entre elles —un avís verbal o una reunió amb la junta— és el
 * que la junta ha de tenir davant en triar.
 */
export function GravetatTria({
  suggerida,
  triada,
  onTria,
}: {
  readonly suggerida: number
  readonly triada: number | null
  readonly onTria: (gravetat: number) => void
}) {
  const { t } = useTranslation()

  // Una gravetat fora de l'1-3 no hauria d'existir —el CHECK la fita— però si
  // hi arriba, el número pelat diu la veritat i una cadena buida no.
  const nom = (n: number): string => {
    const clau = clauGravetat(n)
    return clau === null ? String(n) : t(clau)
  }
  const queFer = triada === null ? null : clauQueFer(triada)

  return (
    <Field
      label={t('junta.soci.avis.gravetat')}
      hint={t('junta.soci.avis.gravetatHint', { gravetat: nom(suggerida) })}
    >
      <div className="mt-4 flex gap-4">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={triada === n}
            onClick={() => {
              onTria(n)
            }}
            className={
              'flex min-h-[46px] flex-1 items-center justify-center px-3 text-md font-bold [text-wrap:balance] ' +
              (triada === n
                ? 'bg-brand-cta text-on-brand'
                : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg-secondary')
            }
          >
            {nom(n)}
          </button>
        ))}
      </div>
      {queFer === null ? null : (
        <p className="mt-4 text-sm text-fg-secondary [text-wrap:pretty]">{t(queFer)}</p>
      )}
    </Field>
  )
}
