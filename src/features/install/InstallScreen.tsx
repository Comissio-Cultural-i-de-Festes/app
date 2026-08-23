import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { brand } from '@/config/brand'
import { Button } from '@/ui/Button/Button'
import { LogoMark } from '@/ui/Logo/Logo'

import { SafariShareSheetMock, SafariToolbarMock } from './IosMocks'

/**
 * Adding the app to the home screen.
 *
 * The brief calls this the screen with the most effect on adoption, so it is
 * built as a screen and not as a banner. It appears before signing in, because
 * on iOS the home-screen app has its own storage: install after signing in and
 * the icon opens to a signed-out app.
 *
 * It is skippable. "Not now" continues in Safari with a one-line warning that
 * signing in again from the icon will be needed, and comes back in a week.
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

export interface InstallScreenProps {
  readonly onDone: () => void
  readonly onLater: () => void
}

export function InstallScreen({ onDone, onLater }: InstallScreenProps) {
  const { t } = useTranslation()

  return (
    <main
      className={
        'flex min-h-dvh flex-col overflow-y-auto bg-app px-12 pt-[var(--ds-safe-top)] ' +
        'pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]'
      }
    >
      <h1 className="font-display text-d-md leading-[0.88] tracking-[-0.05em] uppercase">
        {t('install.title')}
      </h1>
      <p className="mt-[14px] text-lg text-fg-secondary [text-wrap:pretty]">{t('install.lede')}</p>

      <ol>
        <Step n="1" title={t('install.step1.title')} body={t('install.step1.body')}>
          <SafariToolbarMock />
        </Step>

        <Step n="2" title={t('install.step2.title')} body={t('install.step2.body')}>
          <SafariShareSheetMock
            above={t('install.step2.sheetAbove')}
            target={t('install.step2.sheetTarget')}
            below={t('install.step2.sheetBelow')}
          />
        </Step>
      </ol>

      {/* What they are about to end up with. The step before this one asks
          them to hunt for a row in a system sheet; this one tells them what
          success looks like, so they know when they have found it. */}
      <section className="mt-[26px] flex items-center gap-8 border border-surface-7 bg-surface-2 px-[18px] py-8">
        <div className="flex flex-none flex-col items-center gap-4">
          <LogoMark size={62} />
          <span className="text-[11.5px] font-medium text-fg-secondary">{brand.shortName}</span>
        </div>
        <p className="flex-1 text-md text-fg-secondary [text-wrap:pretty]">
          {t('install.iconPreview')}
        </p>
      </section>

      <section className="mt-[22px] border-y border-surface-7 px-[18px] py-8">
        <h2 className="text-xs font-extrabold tracking-[0.16em] text-[var(--ds-brand-accent-hi)] uppercase">
          {t('install.payoff.title')}
        </h2>
        <p className="mt-[10px] text-base text-fg-secondary [text-wrap:pretty]">
          {t('install.payoff.body')}
        </p>
      </section>

      <div className="mt-10">
        <Button size="lg" onClick={onDone}>
          {t('install.done')}
        </Button>
      </div>

      <button
        type="button"
        onClick={onLater}
        className={
          'mt-5 min-h-[44px] w-full cursor-pointer border-0 bg-transparent text-center ' +
          'text-[13.5px] font-semibold text-fg-muted [text-wrap:balance]'
        }
      >
        {t('install.later')}
      </button>

      {/* The reason skipping is allowed at all, said out loud rather than
          discovered later at the icon. */}
      <p className="mt-6 text-center text-sm text-[var(--ds-text-faint)] [text-wrap:pretty]">
        {t('install.laterWarning')}
      </p>
    </main>
  )
}
