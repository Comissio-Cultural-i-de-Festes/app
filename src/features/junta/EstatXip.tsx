import { useTranslation } from 'react-i18next'

import { ESTAT_AVIS_PRESENTATION, toneVar } from '@/design/states'

import { type EstatAvis, clauEstat } from './estatAvisos'

/**
 * El xip d'un escaló d'avisos: verd, ambre, taronja o violeta ple.
 *
 * EL COLOR SURT DEL MAPA DE `design/states.ts` I NO D'UNA CLASSE ESCRITA AQUÍ.
 * Allà és on `states.test.ts` mira que cap to no s'acosti al de la marca, que
 * els quatre estiguin separats i que només l'últim sigui ple; una classe
 * `text-error` escrita a mà en aquest fitxer passaria per sobre de les tres
 * regles sense que cap prova ho veiés.
 *
 * EL NOM VA SEMPRE ESCRIT. El color és reforç, com a la porta: «Risc» i
 * «Expulsió a votació» s'han de poder llegir en blanc i negre.
 */
export function EstatXip({ estat }: { readonly estat: EstatAvis }) {
  const { t } = useTranslation()
  const { tone, filled } = ESTAT_AVIS_PRESENTATION[estat]
  const color = toneVar(tone)

  return (
    <span
      className="eyebrow inline-flex flex-none items-center border-[1.5px] px-3 py-[2px] [text-wrap:balance]"
      style={
        filled
          ? { borderColor: color, backgroundColor: color, color: 'var(--ds-on-state)' }
          : { borderColor: color, color }
      }
    >
      {t(clauEstat(estat))}
    </span>
  )
}
