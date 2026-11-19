import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SafariShareSheetMock, SafariToolbarMock } from './IosMocks'

/**
 * Els dos passos del Safari, en un sol lloc.
 *
 * Els diu la pantalla d'instal·lació i els torna a dir la targeta de l'Inici,
 * per a qui ha entrat amb una invitació i no ha vist la pantalla. Dues còpies
 * serien dues explicacions que un dia diuen coses diferents del mateix Safari.
 *
 * Els textos no depenen de la versió d'iOS: no diuen on és la icona de
 * compartir (a baix o a dalt segons la barra) ni què hi ha al voltant de
 * «Afegeix a la pantalla d'inici», que és l'única etiqueta que no ha canviat.
 */

interface StepProps {
  readonly n: string
  readonly title: string
  readonly body: string
  readonly children: ReactNode
}

function Step({ n, title, body, children }: StepProps) {
  return (
    <li className="mt-[26px] flex items-start gap-[14px]">
      <span
        aria-hidden
        className="flex size-[34px] flex-none items-center justify-center bg-brand-cta font-display text-lg text-on-brand"
      >
        {n}
      </span>
      <div className="flex-1">
        <h2 className="text-2xl font-bold tracking-[-0.015em]">{title}</h2>
        <p className="mt-[5px] text-md text-fg-muted [text-wrap:pretty]">{body}</p>
        {children}
      </div>
    </li>
  )
}

export function IosInstallSteps() {
  const { t } = useTranslation()

  return (
    <ol>
      <Step n="1" title={t('install.step1.title')} body={t('install.step1.body')}>
        <SafariToolbarMock />
      </Step>

      <Step n="2" title={t('install.step2.title')} body={t('install.step2.body')}>
        <SafariShareSheetMock target={t('install.step2.sheetTarget')} />
      </Step>
    </ol>
  )
}
