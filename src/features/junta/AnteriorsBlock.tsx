import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { eventTitle } from '@/features/event/title'
import { formatDayMonth } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Chevron } from '@/ui/Chevron/Chevron'
import { NavRow } from '@/ui/Row/Row'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { fetchJuntaAnteriors, juntaEventKeys, juntaHorizonIso } from './eventsApi'

/**
 * Les activitats que ja s'han acabat, plegades al rebedor (issue #29).
 *
 * EL QUE FALTAVA ERA EL CAMÍ, NO LA PANTALLA. Des de l'issue #28 cada activitat
 * té les seves eines a la fitxa —punts, pagaments, qui ha fitxat—, però l'única
 * llista que hi portava era «els que venen», i una festa en surt l'endemà. El
 * diumenge a la tarda no es podia arribar a la de dissabte per donar els punts
 * del desmuntatge; el dilluns, a la casa rural per cobrar qui va pagar en mà.
 *
 * PLEGADA I SENSE DEMANAR RES FINS QUE S'OBRE. El rebedor s'obre a la porta,
 * amb la xarxa de la casa rural, i aquesta llista no és el que es busca allà;
 * una consulta més a cada obertura per a una cosa que es fa el dilluns no
 * compensa. Oberta, se'n demanen deu, i deu més cada cop que cal.
 *
 * SENSE REUNIONS, com «els que venen»: tenen el seu bloc al rebedor, que ja
 * ensenya les tancades, i no tenen eines a la fitxa més enllà de qui ha fitxat.
 */

const PAGE = 10
const GUTTER = 'px-[var(--ds-gutter)]'

export function AnteriorsBlock() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const [open, setOpen] = useState(false)
  const [n, setN] = useState(PAGE)

  const horizon = juntaHorizonIso()
  const anteriors = useQuery({
    queryKey: juntaEventKeys.anteriors(horizon, n),
    queryFn: () => fetchJuntaAnteriors(horizon, n),
    enabled: open,
    // En demanar-ne més, les deu d'abans es queden a la pantalla mentre
    // arriben les següents, en comptes de tornar a la silueta.
    placeholderData: keepPreviousData,
  })
  const rows = anteriors.data ?? []

  return (
    <div className={`pt-12 ${GUTTER}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
        }}
        className="flex min-h-[48px] w-full items-center justify-between gap-5 text-left"
      >
        <span className="display text-d-sm leading-none tracking-[-0.045em]">
          {t('junta.home.anteriors')}
        </span>
        <Chevron className={open ? 'rotate-90' : ''} />
      </button>

      {!open ? null : (
        <>
          <p className="mt-4 text-sm text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
            {t('junta.home.anteriorsSub')}
          </p>
          {anteriors.isPending ? (
            <Skeleton className="mt-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="border-b border-surface-4 py-[15px]">
                  <SkeletonBar w="w-[60%]" h="h-[14px]" />
                  <SkeletonBar w="w-[30%]" h="h-[10px]" className="mt-3" />
                </div>
              ))}
            </Skeleton>
          ) : anteriors.isError ? (
            <div className="mt-6">
              <p role="alert" className="text-md font-bold text-error [text-wrap:pretty]">
                {t(errorKey(anteriors.error))}
              </p>
              <button
                type="button"
                onClick={() => void anteriors.refetch()}
                className="mt-5 min-h-[46px] border-[1.5px] border-warning px-5 text-md font-bold text-warning"
              >
                {t('actions.retry')}
              </button>
            </div>
          ) : rows.length === 0 ? (
            <p className="mt-6 text-md text-fg-muted [text-wrap:pretty]">
              {t('junta.home.anteriorsNone')}
            </p>
          ) : (
            <>
              <div className="mt-6 border-t border-surface-4">
                {rows.map((e) => (
                  <NavRow
                    key={e.id}
                    to={`/junta/esdeveniment/${e.id}`}
                    title={eventTitle(e.titulo)}
                    sub={[
                      formatDayMonth(new Date(e.starts_at), locale),
                      t(`eventType.${e.tipo}`),
                      e.published ? null : t('junta.draft'),
                    ]
                      .filter((s): s is string => s !== null)
                      .join(' · ')}
                  />
                ))}
              </div>
              {/* Si n'han arribat menys de les que es demanaven, no n'hi ha
                  més: el botó seria una promesa buida. */}
              {rows.length < n ? null : (
                <button
                  type="button"
                  disabled={anteriors.isFetching}
                  onClick={() => {
                    setN(n + PAGE)
                  }}
                  className="mt-6 min-h-[46px] w-full border-[1.5px] border-surface-7 px-5 text-md font-bold text-fg-secondary [text-wrap:balance] disabled:opacity-70"
                >
                  {anteriors.isFetching ? t('state.loading') : t('junta.home.anteriorsMore')}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
