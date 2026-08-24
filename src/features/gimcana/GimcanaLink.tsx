import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { fetchGimcana, gimcanaKeys } from './api'

/**
 * La porta de la gimcana, al detall de l'activitat.
 *
 * Només surt quan n'hi ha una i està oberta, que és la mateixa finestra que la
 * de fitxar: mentre la festa passa. Una fila que digués «gimcana» tot el mes
 * abans seria una promesa que la pantalla del darrere no pot complir, perquè
 * fins que la festa no comença no es veu res.
 */
export function GimcanaLink({ eventId }: { readonly eventId: string }) {
  const { t } = useTranslation()

  const gimcana = useQuery({
    queryKey: gimcanaKeys.one(eventId),
    queryFn: () => fetchGimcana(eventId),
  })

  if (gimcana.data?.estat !== 'oberta') return null
  const { proves, a_la_cua } = gimcana.data
  const done = proves.filter((p) => p.estat === 'validada').length

  return (
    <section className="pt-12 px-[var(--ds-gutter)]">
      <Link
        to={`/esdeveniment/${eventId}/gimcana`}
        className="flex min-h-[60px] items-center justify-between gap-5 border border-brand-banner-border bg-brand-banner px-8 py-6 text-fg no-underline"
      >
        <span className="min-w-0">
          <span className="block text-md font-bold">{t('gimcana.title')}</span>
          <span className="tabular mt-1 block text-[12.5px] text-brand-banner-fg">
            {t('gimcana.linkSub', { done, total: proves.length })}
            {a_la_cua > 0 ? ` · ${t('gimcana.inQueue', { count: a_la_cua })}` : ''}
          </span>
        </span>
        <span aria-hidden="true" className="flex-none text-2xl text-fg-muted-lo">
          ›
        </span>
      </Link>
    </section>
  )
}
