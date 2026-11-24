import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { fetchSummaries, homeKeys } from '@/features/home/api'
import { dayStartIso, summaryOf } from '@/features/home/summary'
import { useUserId } from '@/features/session/useUserId'
import { formatDateLong } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Button } from '@/ui/Button/Button'
import { Notice } from '@/ui/Notice/Notice'
import { SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { eventKeys, fetchEvent } from './api'
import { esApuntat, esborrenEl } from './viatger'
import { fetchDemanaViatger, fetchMevaMarca, viatgerKeys } from './viatgerApi'

/**
 * El registre de viatgers, a la fitxa de l'esdeveniment.
 *
 * NO BLOQUEJA EL SÍ. Dir que hi vas és un toc i es queda així; el que fa aquest
 * bloc és aparèixer just a sota, en ambre, i dir que falten les dades i per a
 * què. Posar el formulari entremig del «sí» hauria fet que qui té pressa —o qui
 * no porta el DNI a sobre— no s'apuntés, i la plaça és el que compta primer.
 *
 * ABANS DEL SÍ, UNA LÍNIA. Qui encara no s'ha apuntat sap ja què se li
 * demanarà, al costat del botó i no després: és la mateixa regla que la cara a
 * la llista d'assistents.
 *
 * DESPRÉS, FINS QUE S'ESBORREN. Les dades es poden revisar i canviar fins al
 * dia que se'n van soles, i el bloc diu quin dia és. Passat aquell dia ja no hi
 * ha res a dir i el bloc desapareix.
 *
 * Les consultes de l'esdeveniment i del resum de les assistències són les
 * mateixes claus que la pantalla: no surt cap petició de més. Mentre el resum
 * no arriba no se sap si hi vaig, i el bloc calla: la línia d'abans del sí, a
 * qui ja ha dit que sí, li diria que no consta.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function ViatgerBlock({ eventId }: { readonly eventId: string }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const navigate = useNavigate()
  const userId = useUserId()
  const [now] = useState(() => Date.now())

  const event = useQuery({ queryKey: eventKeys.one(eventId), queryFn: () => fetchEvent(eventId) })
  const desde = dayStartIso(new Date(now))
  const summaries = useQuery({
    queryKey: homeKeys.summaries([eventId], desde),
    queryFn: () => fetchSummaries([eventId], desde),
  })
  const demana = useQuery({
    queryKey: viatgerKeys.demana(eventId),
    queryFn: () => fetchDemanaViatger(eventId),
  })

  const apuntat = esApuntat(summaryOf(summaries.data ?? [], eventId).mine)
  const meves = useQuery({
    queryKey: viatgerKeys.marca(eventId, userId),
    queryFn: () => fetchMevaMarca(eventId, userId),
    enabled: demana.data === true && apuntat,
  })

  // Si el bloc l'ha vist aparèixer —ha dit que sí mirant la pantalla— l'avís
  // s'anuncia; si ja hi era en obrir-la, no. Es desa durant el render la
  // primera vegada que hi ha resposta, que és el patró de React per recordar
  // un valor d'abans sense un efecte.
  const [apuntatEnArribar, setApuntatEnArribar] = useState<boolean | null>(null)
  if (summaries.isSuccess && apuntatEnArribar === null) setApuntatEnArribar(apuntat)

  const e = event.data
  if (demana.data !== true || e == null || !summaries.isSuccess) return null

  const esborren = esborrenEl(e.starts_at, e.ends_at)
  if (esborren.getTime() <= now) return null
  const dia = formatDateLong(esborren, locale)

  if (!apuntat) {
    return (
      <section className={`pt-9 ${GUTTER}`}>
        <p className="text-sm-lo leading-[1.4] text-fg-muted-lo [text-wrap:pretty]">
          {t('viatger.block.before')}
        </p>
      </section>
    )
  }

  return (
    <section className={`pt-12 ${GUTTER}`}>
      <h2 className="eyebrow text-fg-muted">{t('viatger.block.eyebrow')}</h2>

      {meves.isPending ? (
        <SkeletonBar w="w-full" h="h-[96px]" className="mt-6" />
      ) : meves.isError ? (
        <div className="mt-6">
          <p role="alert" className="text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(meves.error))}
          </p>
          <button
            type="button"
            onClick={() => void meves.refetch()}
            className="-ml-2 mt-4 inline-flex min-h-[44px] items-center px-2 text-md font-bold text-brand-label"
          >
            {t('actions.retry')}
          </button>
        </div>
      ) : meves.data === null ? (
        <Notice as="div" live={apuntatEnArribar === false} className="mt-6">
          <p className="text-base font-bold text-fg [text-wrap:pretty]">
            {t('viatger.block.missingTitle')}
          </p>
          <p className="mt-3 text-sm text-fg-secondary [text-wrap:pretty]">
            {t('viatger.block.missingBody', { date: dia })}
          </p>
          <Button
            className="mt-7"
            onClick={() => {
              void navigate(`/esdeveniment/${eventId}/viatger`)
            }}
          >
            {t('viatger.block.missingCta')}
          </Button>
        </Notice>
      ) : (
        <Notice as="div" tone="ok" className="mt-6">
          <p className="text-base font-bold [text-wrap:pretty]">{t('viatger.block.doneTitle')}</p>
          <p className="mt-3 text-sm text-fg-secondary [text-wrap:pretty]">
            {t('viatger.block.doneBody', { date: dia })}
          </p>
          <Button
            variant="secondary"
            className="mt-7"
            onClick={() => {
              void navigate(`/esdeveniment/${eventId}/viatger`)
            }}
          >
            {t('viatger.block.doneCta')}
          </Button>
        </Notice>
      )}
    </section>
  )
}
