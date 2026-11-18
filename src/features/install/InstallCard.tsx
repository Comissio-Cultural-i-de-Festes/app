import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/ui/Button/Button'
import { Sheet, SheetClose } from '@/ui/Sheet/Sheet'

import { IosInstallSteps } from './IosInstallSteps'
import {
  SNOOZE_DONE_MS,
  SNOOZE_LATER_MS,
  shouldOfferInstallCard,
  snoozeInstall,
} from './installGate'

/**
 * La instal·lació, quan ja s'és a dins.
 *
 * Qui entra amb una invitació des del Safari d'un iPhone no veu la pantalla
 * d'instal·lació: el codi s'ha de bescanviar abans que res, al mateix Safari, o
 * es perd pel camí cap a la icona. Aquesta és l'oferta que li toca després, a
 * l'Inici, on ja no hi ha res a perdre.
 *
 * Una targeta curta i els passos en un full, i no els passos a la targeta: són
 * dos dibuixos del Safari i fan mitja pantalla, i a l'Inici el que compta és el
 * botó d'apuntar-se, que queda a sobre.
 *
 * La línia de tornar a entrar és al full i no a la targeta. La icona obre un
 * magatzem buit i cal passar per Google un cop més; dit just abans de fer-ho,
 * no sorprèn ningú, i el compte ja és el que és.
 */
export function InstallCard() {
  const { t } = useTranslation()
  // Es llegeix un sol cop: el repòs viu a `localStorage` i res d'aquesta pantalla
  // el canvia si no és aquesta mateixa targeta.
  const [shown, setShown] = useState(() => shouldOfferInstallCard())
  const [steps, setSteps] = useState(false)

  if (!shown) return null

  const answer = (snoozeMs: number) => {
    snoozeInstall(snoozeMs)
    setSteps(false)
    setShown(false)
  }

  return (
    <div className="px-[var(--ds-gutter)]">
      <section className="mt-9 border border-surface-8 bg-surface-2 px-8 py-9">
        <p className="eyebrow text-brand-accent">{t('install.card.eyebrow')}</p>
        <h2 className="display mt-5 text-d-sm leading-[0.98] tracking-[-0.042em] [text-wrap:balance]">
          {t('install.card.title')}
        </h2>
        <p className="mt-5 text-base text-fg-secondary [text-wrap:pretty]">
          {t('install.card.body')}
        </p>

        <div className="mt-8">
          <Button onClick={() => setSteps(true)}>{t('install.card.cta')}</Button>
        </div>

        <button
          type="button"
          onClick={() => answer(SNOOZE_LATER_MS)}
          className="mt-5 min-h-[44px] text-base font-bold text-fg-secondary"
        >
          {t('install.card.later')}
        </button>
      </section>

      {steps ? (
        <Sheet label={t('install.title')} onClose={() => setSteps(false)}>
          <div className="flex items-start justify-between gap-5">
            <h2 className="display min-w-0 flex-1 text-d-xs leading-[1.05] tracking-[-0.04em] [text-wrap:balance]">
              {t('install.title')}
            </h2>
            <SheetClose onClose={() => setSteps(false)} />
          </div>

          <IosInstallSteps />

          <p className="mt-9 text-sm text-fg-muted [text-wrap:pretty]">{t('install.card.again')}</p>

          <div className="mt-8">
            <Button onClick={() => answer(SNOOZE_DONE_MS)}>{t('install.done')}</Button>
          </div>
        </Sheet>
      ) : null}
    </div>
  )
}
