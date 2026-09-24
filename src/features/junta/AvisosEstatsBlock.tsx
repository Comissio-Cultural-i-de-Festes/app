import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { ESTAT_AVIS_PRESENTATION, toneVar } from '@/design/states'

import { ESTATS, clauEstat } from './estatAvisos'
import { useEstatsAvisos } from './useEstatsAvisos'

/**
 * Quanta gent hi ha a cada escaló d'avisos, al rebedor de `/junta`.
 *
 * QUATRE NÚMEROS I NO UNA LLISTA DE NOMS. El rebedor és on la junta mira si hi
 * ha feina, no on s'hi fa: els noms, el pes i el botó de debò són a
 * `/junta/socis`, i tot el bloc hi porta. Una llista de «qui és a risc» aquí
 * seria un expedient a la pantalla que s'obre a la porta d'una festa.
 *
 * ELS «OK» TAMBÉ HI SÓN, i són els actius que no han arribat a cap escaló. Sense
 * ells, «1 a risc» no es pot llegir: no és el mateix un d'entre quaranta que un
 * d'entre cinc.
 *
 * MENTRE NO HO SAP, NO HO DIU. Els quatre números surten junts o no surt cap:
 * «0 a risc» mentre encara arriben les dades és una afirmació falsa.
 *
 * El color de cada número és el del seu xip, del mateix mapa de
 * `design/states.ts`, i el de l'expulsió hi va ple com allà quan n'hi ha algun:
 * és el que fa que es llegeixi com el més greu sense dependre del to. Un zero
 * ple cridaria l'atenció cap a una cosa que no ha passat.
 *
 * DOS PER DOS I NO QUATRE EN FILA. A 390px, quatre columnes deixaven 88px per
 * a «Expulsió a votació», que es partia en tres línies i tocava la vora. Es va
 * veure obrint la pantalla.
 */
export function AvisosEstatsBlock() {
  const { t } = useTranslation()
  const { perEstat, llest } = useEstatsAvisos()

  return (
    <Link
      to="/junta/socis"
      aria-label={t('junta.home.estats.aria')}
      className="mx-[var(--ds-gutter)] mt-6 grid grid-cols-2 gap-[1px] bg-surface-4 no-underline"
    >
      {ESTATS.map((estat) => {
        const { tone, filled } = ESTAT_AVIS_PRESENTATION[estat]
        const color = toneVar(tone)
        return (
          <span key={estat} className="flex min-h-[78px] items-center gap-5 bg-app px-6 py-5">
            <span
              className="display tabular min-w-[44px] flex-none px-2 text-center text-d-sm leading-none tracking-[-0.05em]"
              style={
                !llest
                  ? undefined
                  : filled && perEstat[estat] > 0
                    ? { backgroundColor: color, color: 'var(--ds-on-state)' }
                    : { color }
              }
            >
              {llest ? perEstat[estat] : '—'}
            </span>
            <span className="eyebrow min-w-0 text-[var(--ds-text-muted-lo)] [text-wrap:balance]">
              {t(clauEstat(estat))}
            </span>
          </span>
        )
      })}
    </Link>
  )
}
