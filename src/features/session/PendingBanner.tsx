import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InviteCodeSheet } from './InviteCodeSheet'
import { useMyProfile } from './useMyProfile'

/**
 * «Encara no ets dins», a dalt de tot, fins que la junta t'accepti.
 *
 * ERA UN AVÍS A L'INICI I NO N'HI HAVIA PROU. Viure a `HomeScreen` volia dir
 * que competia amb dos avisos més per l'únic lloc que hi ha sobre el hero —i
 * hi perdia contra un fitxatge que no va comptar, correctament— i que
 * desapareixia del tot en tocar qualsevol pestanya. El resultat era que el
 * botó desactivat del Rànquing i el QR buit no tenien cap explicació a la
 * vista: només un estat que s'havia llegit una vegada, a una altra pantalla.
 * Ara és cromàtica de l'aplicació, com la barra de pestanyes, i per això viu a
 * `TabLayout` i no a cap pantalla.
 *
 * DESPLEGADA EL PRIMER COP, PLEGADA PER SEMPRE MÉS. Desplegada diu per què i
 * què es pot fer mentrestant; plegada són 38 px que no marxen. El plec es
 * recorda a `localStorage` perquè un estat de React es reinicia a cada
 * navegació, i una banda que es torna a obrir cada vegada que toques una
 * pestanya és una banda que la gent aprèn a tancar sense llegir.
 *
 * I LES DUES CARES NO ES COL·LOQUEN IGUAL. La plegada és `fixed`, com la barra
 * de baix, i el lloc l'hi reserva `.with-banner`. La desplegada va al flux i
 * empeny: fa quatre-cents píxels d'alçada, i `fixed` li reservava els 38 de la
 * plegada —o sigui que tapava la capçalera i la portada de l'Inici senceres.
 * Reservar l'alçada de debò voldria mesurar-la amb un observador; empènyer no
 * vol res, i que la versió desplegada marxi en desplaçar és exactament el que
 * ha de fer: el que no marxa mai és la línia.
 *
 * AMBRE I NO VERMELL. És un estat, i el vermell és la marca. El punt de 7 px
 * de la línia plegada és el mateix que ja fan servir el «sense connexió» i la
 * cua de fitxatges a la capçalera de l'Inici: qui n'ha vist un, en reconeix
 * l'altre.
 *
 * NO PORTA `role="status"`. Hi és des del primer render, i la regla escrita a
 * `ui/Notice/Notice.tsx` és que s'anuncia el que entra sol, no el que ja hi
 * era. El que sí que porta és `aria-expanded`, perquè el plec sí que és una
 * cosa que passa mentre algú mira.
 *
 * NOMÉS PER A QUI ESTÀ PENDENT. `estat` també pot ser `'baixa'`, i a algú que
 * ha plegat no se li diu que la junta l'ha d'acceptar; aquella pantalla és una
 * altra conversa i la té el QR. El botó desactivat de l'Inici sí que és per
 * als dos casos, i per això aquella condició es queda allà on és.
 */

const KEY = 'comi.pending.collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    // Safari en privat llança en llegir. Desplegada és el pitjor cas
    // acceptable; no poder pintar la banda, no.
    return false
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, collapsed ? '1' : '0')
  } catch {
    /* El plec és una comoditat. Si no es pot desar, la banda encara funciona. */
  }
}

/** El filet ambre i el fons, iguals a les dues cares. */
const SKIN = 'border-b border-surface-6 border-l-[3px] border-l-warning bg-surface-1'

/**
 * El plec, compartit amb `TabLayout`.
 *
 * L'estat viu aquí i el llegeixen dos components, perquè el contenidor ha de
 * saber si posa `.with-banner` o no: amb la banda desplegada el coixí no toca,
 * i amb dos `useState` separats el commutador no es veuria a l'altre costat.
 */
export function usePendingBanner() {
  const { data: profile } = useMyProfile()
  const [collapsed, setCollapsed] = useState(readCollapsed)

  return {
    /** Si hi ha banda. `'baixa'` no en té: vegeu la nota de dalt. */
    showing: profile?.estat === 'pendent',
    collapsed,
    collapse: (next: boolean) => {
      setCollapsed(next)
      writeCollapsed(next)
    },
  }
}

export function PendingBanner({
  showing,
  collapsed,
  collapse,
}: {
  readonly showing: boolean
  readonly collapsed: boolean
  readonly collapse: (next: boolean) => void
}) {
  const { t } = useTranslation()
  const [asking, setAsking] = useState(false)

  if (!showing) return null

  return (
    <>
      <div
        className={
          collapsed
            ? 'fixed top-0 left-1/2 z-30 w-full max-w-[var(--ds-shell-max-w)] -translate-x-1/2 pt-[var(--ds-safe-top-min)]'
            : 'pt-[var(--ds-safe-top-min)]'
        }
      >
        {collapsed ? (
          <button
            type="button"
            aria-expanded={false}
            onClick={() => collapse(false)}
            className={`flex min-h-[var(--ds-banner-h)] w-full items-center gap-[9px] px-[var(--ds-gutter)] py-4 text-left ${SKIN}`}
          >
            <span aria-hidden="true" className="size-[7px] flex-none rounded-full bg-warning-deep" />
            <span className="flex-1 text-sm-lo font-bold text-warning-deep [text-wrap:pretty]">
              {t('pending.title')}
            </span>
            <span className="flex-none text-sm-lo font-bold text-fg-muted">
              {t('pending.expand')} ›
            </span>
          </button>
        ) : (
          <div className={`px-[var(--ds-gutter)] pt-8 pb-9 ${SKIN}`}>
            <div className="flex items-start justify-between gap-5">
              <p className="eyebrow-sm text-warning-deep">{t('pending.eyebrow')}</p>
              <button
                type="button"
                aria-expanded
                onClick={() => collapse(true)}
                className="-mt-4 -mr-3 flex min-h-[44px] min-w-[44px] flex-none items-center justify-center text-base font-bold text-fg-muted"
              >
                {t('pending.collapse')}
              </button>
            </div>

            <p className="display mt-3 text-d-xs leading-none tracking-[-0.04em] [text-wrap:balance]">
              {t('pending.title')}
            </p>
            <p className="mt-5 text-md leading-[1.35] text-fg-secondary [text-wrap:pretty]">
              {t('pending.body')}
            </p>

            {/* Què es pot fer i què no, un al costat de l'altre. Dir només el
                que no es pot fer deixa la pantalla llegint-se com una porta
                tancada, i el calendari sí que és obert. */}
            <div className="mt-7 flex gap-4">
              <div className="flex-1 border-t border-surface-6 pt-4">
                <p className="eyebrow-sm text-success">{t('pending.canLabel')}</p>
                <p className="mt-[5px] text-sm-lo leading-[1.35] text-fg-muted [text-wrap:pretty]">
                  {t('pending.can')}
                </p>
              </div>
              <div className="flex-1 border-t border-surface-6 pt-4">
                <p className="eyebrow-sm text-warning-deep">{t('pending.cannotLabel')}</p>
                <p className="mt-[5px] text-sm-lo leading-[1.35] text-fg-muted [text-wrap:pretty]">
                  {t('pending.cannot')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setAsking(true)}
              className="mt-8 flex min-h-[48px] w-full items-center justify-center border-[1.5px] border-border-strong bg-surface-2 px-7 py-6 text-base font-bold text-fg [text-wrap:balance]"
            >
              {t('pending.haveCode')}
            </button>
            <p className="mt-5 text-sm-lo leading-[1.4] text-fg-muted-lo [text-wrap:pretty]">
              {t('pending.haveCodeHint')}
            </p>
          </div>
        )}
      </div>

      {asking ? (
        <InviteCodeSheet
          onClose={() => {
            setAsking(false)
          }}
        />
      ) : null}
    </>
  )
}
