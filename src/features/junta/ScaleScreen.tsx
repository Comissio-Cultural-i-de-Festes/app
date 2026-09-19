import { useTranslation } from 'react-i18next'

import { AvisTipusBlock } from './AvisTipusBlock'
import { JuntaHeader } from './JuntaHeader'
import { ScaleBlock } from './ScaleBlock'

/**
 * El barem: què val cada cosa i quins avisos hi ha.
 *
 * Dues coses que no es parlen, cadascuna al seu fitxer i cadascuna amb les
 * seves dades. La pantalla només diu en quin ordre van i com se'n surt.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function ScaleScreen() {
  const { t } = useTranslation()
  return (
    <main className="min-h-dvh bg-app pb-[calc(var(--ds-safe-bottom)+32px)]">
      <JuntaHeader
        to="/junta"
        label={t('junta.back')}
        title={t('junta.config.scale.title')}
        className="lg:hidden"
      />
      <div className={`pt-8 ${GUTTER}`}>
        <ScaleBlock />
        <AvisTipusBlock />
      </div>
    </main>
  )
}
