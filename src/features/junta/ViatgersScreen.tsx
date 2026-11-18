import { type UseQueryResult, useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { eventKeys, fetchEvent } from '@/features/event/api'
import { nomDelPais } from '@/features/event/paisos'
import { eventTitle } from '@/features/event/title'
import { esborrenEl } from '@/features/event/viatger'
import { fetchDemanaViatger, viatgerKeys } from '@/features/event/viatgerApi'
import { formatDateLong } from '@/i18n/format'
import { INTL_LOCALE, toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { download, safeFilename } from '@/lib/share'
import { Button } from '@/ui/Button/Button'
import { Notice } from '@/ui/Notice/Notice'
import { DoneLine } from '@/ui/Notice/DoneLine'
import { ROW, RowBody } from '@/ui/Row/Row'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { JuntaHeader } from './JuntaHeader'
import { csvViatgers } from './viatgersCsv'
import {
  type Apuntat,
  type DadesAmbQui,
  fetchApuntats,
  fetchDades,
  viatgersKeys,
} from './viatgersApi'

/**
 * Qui ha posat les dades de viatger, i les dades quan calen.
 *
 * LA LLISTA NO PORTA CAP DADA. Qui hi va, en quin estat i si les ha posat: és
 * el que la junta mira deu vegades la setmana abans de marxar, i no ha de
 * deixar cap rastre al registre cada cop.
 *
 * LES DADES, AMB UN BOTÓ I AMB EL REGISTRE AL DAVANT. Mirar-les i exportar-les
 * són dues crides a `admin_dades_viatgers`, i cadascuna és una fila a
 * `audit_log` amb el teu nom; la pantalla ho diu abans del botó i no després.
 * No es desen a la cau: viuen a l'estat de la pantalla i se'n van en sortir-ne.
 *
 * NOMÉS ES TREUEN LES DE QUI TÉ PLAÇA. Qui espera o encara no s'ha decidit surt
 * a la llista —ha de poder posar-les—, però no a l'exportació: a l'allotjament
 * s'hi envia qui hi dormirà.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function ViatgersScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const { id = '' } = useParams()

  const event = useQuery({ queryKey: eventKeys.one(id), queryFn: () => fetchEvent(id) })
  const demana = useQuery({
    queryKey: viatgerKeys.demana(id),
    queryFn: () => fetchDemanaViatger(id),
  })
  const apuntats = useQuery({
    queryKey: viatgersKeys.llista(id),
    queryFn: () => fetchApuntats(id),
    enabled: demana.data === true,
  })

  const [dades, setDades] = useState<readonly DadesAmbQui[] | null>(null)
  const [exportat, setExportat] = useState<string | null>(null)

  // `always`: sense xarxa, una exportació en pausa sortiria sola quan tornés la
  // cobertura i el fitxer apareixeria a les baixades sense que ningú l'hagués
  // tornat a demanar. Millor que falli i ho digui.
  const mira = useMutation({
    networkMode: 'always',
    mutationFn: () => fetchDades(id, false),
    onSuccess: (rows) => {
      setDades(rows)
    },
  })

  const exporta = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      const rows = await fetchDades(id, true)
      const titol = event.data == null ? '' : eventTitle(event.data.titulo)
      const blob = new Blob([csvViatgers(rows)], { type: 'text/csv;charset=utf-8' })
      if (download(blob, safeFilename(['viatgers', titol], 'viatgers', 'csv')) === 'failed') {
        throw new Error('no s’ha pogut desar el fitxer')
      }
      return rows.length
    },
    onSuccess: (n) => {
      setExportat(
        n === 0 ? t('junta.viatgers.exportNone') : t('junta.viatgers.exported', { count: n }),
      )
    },
  })

  const titol = event.data == null ? t('actions.back') : eventTitle(event.data.titulo)
  const e = event.data

  return (
    <main className="min-h-dvh bg-app pb-[calc(var(--ds-safe-bottom)+32px)]">
      <JuntaHeader
        to={`/junta/esdeveniment/${id}`}
        label={titol}
        title={t('junta.viatgers.title')}
      />

      {demana.isPending || event.isPending ? (
        <ViatgersSkeleton />
      ) : demana.isError || event.isError ? (
        <p
          role="alert"
          className={`pt-10 text-md font-bold text-error [text-wrap:pretty] ${GUTTER}`}
        >
          {t(errorKey(demana.error ?? event.error))}
        </p>
      ) : !demana.data ? (
        <div className={`pt-10 ${GUTTER}`}>
          <p className="text-md text-fg-secondary [text-wrap:pretty]">{t('junta.viatgers.off')}</p>
          <Link
            to={`/junta/esdeveniment/${id}`}
            className="-ml-2 mt-6 inline-flex min-h-[44px] items-center px-2 text-md font-bold text-brand-label"
          >
            {t('junta.viatgers.toForm')}
          </Link>
        </div>
      ) : (
        <>
          <section className={`pt-8 ${GUTTER}`}>
            <Notice tone="neutral">
              {t('junta.viatgers.note')}
              {e == null
                ? null
                : ` ${t('junta.viatgers.purge', {
                    date: formatDateLong(esborrenEl(e.starts_at, e.ends_at), locale),
                  })}`}
            </Notice>
          </section>

          <Llista apuntats={apuntats} />

          <section className={`pt-12 ${GUTTER}`}>
            <Button
              size="lg"
              disabled={exporta.isPending}
              onClick={() => {
                setExportat(null)
                exporta.mutate()
              }}
            >
              {exporta.isPending ? t('state.loading') : t('junta.viatgers.export')}
            </Button>
            <DoneLine className="mt-5" message={exportat} />
            {exporta.isError ? (
              <p role="alert" className="mt-5 text-md font-bold text-error [text-wrap:pretty]">
                {t(errorKey(exporta.error))}
              </p>
            ) : null}

            <Button
              variant="secondary"
              className="mt-7"
              disabled={mira.isPending}
              onClick={() => {
                if (dades === null) mira.mutate()
                else setDades(null)
              }}
            >
              {mira.isPending
                ? t('state.loading')
                : dades === null
                  ? t('junta.viatgers.show')
                  : t('junta.viatgers.hide')}
            </Button>
            {mira.isError ? (
              <p role="alert" className="mt-5 text-md font-bold text-error [text-wrap:pretty]">
                {t(errorKey(mira.error))}
              </p>
            ) : null}
          </section>

          {dades === null ? null : <Fitxes dades={dades} />}
        </>
      )}
    </main>
  )
}

function Llista({ apuntats }: { readonly apuntats: UseQueryResult<Apuntat[]> }) {
  const { t } = useTranslation()

  if (apuntats.isPending) {
    return (
      <div className={`pt-9 ${GUTTER}`}>
        <SkeletonBar w="w-full" h="h-[52px]" />
        <SkeletonBar w="w-full" h="h-[52px]" className="mt-3" />
      </div>
    )
  }
  if (apuntats.isError) {
    return (
      <p role="alert" className={`pt-9 text-md font-bold text-error [text-wrap:pretty] ${GUTTER}`}>
        {t(errorKey(apuntats.error))}
      </p>
    )
  }

  const llista = apuntats.data
  if (llista.length === 0) {
    return (
      <p className={`pt-9 text-md text-fg-muted [text-wrap:pretty] ${GUTTER}`}>
        {t('junta.viatgers.empty')}
      </p>
    )
  }

  const posades = llista.filter((a) => a.te_dades).length

  return (
    <section className={`pt-10 ${GUTTER}`}>
      <h2 className="eyebrow text-fg-muted">
        {t('junta.viatgers.summary', { posades, total: llista.length })}
      </h2>
      <ul className="mt-3">
        {llista.map((a) => {
          const ambPlaca = a.estado === 'si' || a.estado === 'asistio'
          return (
            <li key={a.user_id} className={ROW}>
              <RowBody
                title={a.nombre}
                sub={
                  t(`junta.viatgers.estat.${a.estado}`) +
                  (ambPlaca ? '' : ` · ${t('junta.viatgers.noExport')}`)
                }
              />
              <span
                className={
                  'flex-none text-sm font-bold ' + (a.te_dades ? 'text-success' : 'text-warning')
                }
              >
                {a.te_dades ? t('junta.viatgers.has') : t('junta.viatgers.missing')}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * Les dades, una fitxa per persona. Per a un mòbil a la recepció d'una casa:
 * es llegeixen de dalt a baix, no en una taula de tretze columnes.
 */
function Fitxes({ dades }: { readonly dades: readonly DadesAmbQui[] }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const intl = INTL_LOCALE[locale]

  if (dades.length === 0) {
    return (
      <p className={`pt-10 text-md text-fg-muted [text-wrap:pretty] ${GUTTER}`}>
        {t('junta.viatgers.exportNone')}
      </p>
    )
  }

  return (
    <ul className={`pt-10 ${GUTTER}`}>
      {dades.map((d) => {
        const camps: readonly (readonly [string, string])[] = [
          [t('viatger.field.sexe'), t(`viatger.sexe.${d.sexe}`)],
          [t('viatger.field.data_naixement'), d.data_naixement.split('-').reverse().join('/')],
          [t('viatger.field.nacionalitat'), nomDelPais(d.nacionalitat, intl)],
          [t('viatger.field.tipus_document'), t(`viatger.document.${d.tipus_document}`)],
          [t('viatger.field.numero_document'), d.numero_document],
          ...(d.numero_suport === null
            ? []
            : [[t('viatger.field.numero_suport'), d.numero_suport] as const]),
          [t('viatger.field.adreca'), d.adreca],
          [t('viatger.field.localitat'), d.localitat],
          [t('viatger.field.pais'), nomDelPais(d.pais, intl)],
          [t('viatger.field.telefon_emergencia'), d.telefon_emergencia],
        ]
        return (
          <li key={d.user_id} className="mb-7 border border-surface-8 bg-surface-1 p-8">
            <p className="text-lg font-bold [text-wrap:pretty]">
              {[d.nom, d.cognom1, d.cognom2].filter(Boolean).join(' ')}
            </p>
            <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
              {camps.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-fg-muted">{k}</dt>
                  <dd className="min-w-0 font-semibold [overflow-wrap:anywhere] text-fg">{v}</dd>
                </div>
              ))}
            </dl>
          </li>
        )
      })}
    </ul>
  )
}

function ViatgersSkeleton() {
  return (
    <Skeleton className={`pt-10 ${GUTTER}`}>
      <SkeletonBar w="w-full" h="h-[72px]" />
      <SkeletonBar w="w-[50%]" h="h-[14px]" className="mt-10" />
      <SkeletonBar w="w-full" h="h-[52px]" className="mt-5" />
      <SkeletonBar w="w-full" h="h-[52px]" className="mt-3" />
    </Skeleton>
  )
}
