import { useTranslation } from 'react-i18next'

import { GrausBlock } from './configGraus'
import { PeriodsBlock } from './configPeriods'
import { ScaleBlock } from './configScale'
import { JuntaHeader } from './JuntaHeader'

/**
 * The three things the app reads every day and nobody could change.
 *
 * The ranking calendar, the points scale and the degree list were all put in
 * tables rather than in code, each for the same stated reason: they belong to
 * a university and a committee that both change every year, and a deploy is
 * not an acceptable dependency for moving a date. Then all three were left to
 * the Supabase dashboard, which one person has an account for — so in practice
 * they were configurable and unchangeable at the same time.
 *
 * Three blocks on one screen rather than three screens. They are opened
 * roughly once a year, by the same person, in the same sitting.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function ConfigScreen() {
  const { t } = useTranslation()

  return (
    <main className="min-h-dvh bg-app pb-[calc(env(safe-area-inset-bottom,0px)+32px)]">
      <JuntaHeader
        to="/junta"
        label={t('junta.back')}
        title={t('junta.config.title')}
        className="lg:hidden"
      />

      <p className={`pt-8 pb-2 text-md text-fg-secondary [text-wrap:pretty] ${GUTTER}`}>
        {t('junta.config.lede')}
      </p>

      <Block title={t('junta.config.periods.title')}>
        <PeriodsBlock />
      </Block>

      <Block title={t('junta.config.scale.title')}>
        <ScaleBlock />
      </Block>

      <Block title={t('junta.config.graus.title')}>
        <GrausBlock />
      </Block>
    </main>
  )
}

function Block({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <section className={`border-t border-surface-4 pt-10 pb-12 ${GUTTER} mt-10`}>
      <h2 className="display pb-6 text-d-xs tracking-[-0.04em] [text-wrap:balance]">{title}</h2>
      {children}
    </section>
  )
}
