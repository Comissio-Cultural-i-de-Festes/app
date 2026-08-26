import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { decideProva, fetchQueue, gimcanaKeys, undoProva } from '@/features/gimcana/api'
import { teamName } from '@/features/gimcana/teamName'
import { errorKey } from '@/lib/errors'
import { GIMCANA_PHOTOS, signedUrls } from '@/lib/storage'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { JuntaHeader } from './JuntaHeader'

/**
 * Validar la gimcana.
 *
 * ESTÀ FETA PERQUÈ COSTI SEGONS, NO LA NIT. La junta va escollir validar abans
 * de puntuar, i el preu és que algú ha de mirar les fotos mentre la festa
 * passa. Per això n'ensenya UNA, amb dos botons grans, i la següent surt sola:
 * a dues per minut, una cua de dotze són sis minuts entre tots.
 *
 * I per això hi ha «desfés»: anar de pressa vol dir equivocar-se de tant en
 * tant, i sense una manera de tornar enrere la gent va a poc a poc.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function GimcanaValidateScreen() {
  const { t } = useTranslation()
  const { eventId = '' } = useParams()
  const client = useQueryClient()
  const [motiu, setMotiu] = useState('')
  // El «no val» en dos temps. El camp del motiu era sota els botons, o sigui
  // que en l'ordre de lectura ningú l'omplia: el codi mateix deia que era
  // «opcional al camp i obligatori a l'esperit». Ara el primer toc l'ensenya i
  // el segon confirma. Pot quedar buit, però s'ha vist.
  const [refusing, setRefusing] = useState(false)
  const why = useRef<HTMLInputElement>(null)
  const [last, setLast] = useState<{ id: string; prova: string } | null>(null)

  const queue = useQuery({
    queryKey: gimcanaKeys.queue(eventId),
    queryFn: () => fetchQueue(eventId),
    enabled: eventId !== '',
  })

  const rows = queue.data ?? []
  const current = rows[0] ?? null

  const urls = useQuery({
    queryKey: ['junta', 'gimcana', 'urls', current?.path ?? ''],
    queryFn: () => signedUrls(GIMCANA_PHOTOS, [current?.path ?? '']),
    enabled: current !== null,
  })

  const decide = useMutation({
    mutationFn: ({ id, val }: { id: string; val: boolean }) =>
      decideProva(id, val, val ? undefined : motiu.trim() === '' ? undefined : motiu.trim()),
    onSuccess: async (_estat, vars) => {
      setLast({ id: vars.id, prova: current?.prova ?? '' })
      setMotiu('')
      setRefusing(false)
      await client.invalidateQueries({ queryKey: gimcanaKeys.all() })
      await client.invalidateQueries({ queryKey: gimcanaKeys.queue(eventId) })
    },
  })

  const undo = useMutation({
    mutationFn: (id: string) => undoProva(id),
    onSuccess: async () => {
      setLast(null)
      await client.invalidateQueries({ queryKey: gimcanaKeys.all() })
      await client.invalidateQueries({ queryKey: gimcanaKeys.queue(eventId) })
    },
  })

  return (
    <main className="min-h-dvh bg-app pb-10">
      <JuntaHeader
        to="/junta"
        label={t('junta.back')}
        title={t('junta.gimcana.validateTitle')}
        aside={
          rows.length > 0 ? (
            <span className="tabular text-sm-lo font-bold text-[var(--ds-warning)]">
              {t('junta.gimcana.inQueue', { count: rows[0]?.a_la_cua ?? rows.length })}
            </span>
          ) : null
        }
      />

      <div className={`pt-7 ${GUTTER}`}>
        {queue.isPending ? (
          <QueueSkeleton />
        ) : queue.isError ? (
          <p role="alert" className="py-8 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(queue.error))}
          </p>
        ) : current === null ? (
          <p className="py-8 text-md text-fg-muted [text-wrap:pretty]">
            {t('junta.gimcana.queueEmpty')}
          </p>
        ) : (
          <>
            <div className="h-[250px] w-full bg-surface-3">
              {urls.data?.get(current.path) === undefined ? null : (
                <img
                  src={urls.data.get(current.path)}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="size-full object-contain"
                />
              )}
            </div>

            <div className="mt-7 flex items-baseline justify-between gap-5">
              <p className="text-lg font-bold [text-wrap:pretty]">{current.prova}</p>
              <p className="tabular flex-none text-lg font-extrabold text-success">
                +{current.punts}
              </p>
            </div>
            <p className="mt-2 text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
              {current.qui} · {teamName(current, 0, t)}
            </p>

            <div className="mt-7 grid grid-cols-2 items-stretch gap-5">
              <button
                type="button"
                disabled={decide.isPending}
                onClick={() => {
                  decide.mutate({ id: current.id, val: true })
                }}
                className="flex min-h-[62px] items-center justify-center bg-brand-cta px-6 py-6 text-xl font-bold text-on-brand [text-wrap:balance] disabled:opacity-60"
              >
                {t('junta.gimcana.yes', { n: current.punts })}
              </button>
              <button
                type="button"
                disabled={decide.isPending}
                onClick={() => {
                  if (refusing) {
                    decide.mutate({ id: current.id, val: false })
                  } else {
                    setRefusing(true)
                    // Al camp directament: el segon toc és per confirmar, no
                    // per anar-hi.
                    requestAnimationFrame(() => why.current?.focus())
                  }
                }}
                className={
                  'flex min-h-[62px] items-center justify-center border-[1.5px] px-6 py-6 text-xl font-bold [text-wrap:balance] disabled:opacity-60 ' +
                  (refusing ? 'border-warning text-warning' : 'border-surface-7 text-fg-secondary')
                }
              >
                {refusing ? t('junta.gimcana.confirmNo') : t('junta.gimcana.no')}
              </button>
            </div>

            {/* El perquè és opcional al camp i obligatori a l'esperit: sense
                ell, «no val» és una porta tancada sense explicació. */}
            {refusing ? (
              <input
                ref={why}
                type="text"
                value={motiu}
                maxLength={140}
                onChange={(e) => {
                  setMotiu(e.target.value)
                }}
                aria-label={t('junta.gimcana.whyPlaceholder')}
                placeholder={t('junta.gimcana.whyPlaceholder')}
                className="mt-5 w-full border border-[var(--ds-border-input)] bg-transparent px-7 py-6 text-md text-fg placeholder:text-fg-faint"
              />
            ) : null}

            {decide.isError ? (
              <p role="alert" className="mt-5 text-md font-bold text-error [text-wrap:pretty]">
                {t(errorKey(decide.error))}
              </p>
            ) : null}
          </>
        )}

        {last === null ? null : (
          <p className="mt-7 text-sm text-fg-muted [text-wrap:pretty]">
            {t('junta.gimcana.justDid', { prova: last.prova })}{' '}
            <button
              type="button"
              disabled={undo.isPending}
              onClick={() => {
                undo.mutate(last.id)
              }}
              className="min-h-[44px] font-bold text-brand-label underline disabled:opacity-60"
            >
              {t('actions.undo')}
            </button>
          </p>
        )}

        <p className="mt-7 text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
          {t('junta.gimcana.pace')}
        </p>
      </div>
    </main>
  )
}

/**
 * Una sola prova, no una llista: la foto de 250 px, la prova amb els punts, qui
 * la va enviar i els dos botons grossos.
 *
 * Aquesta és la pantalla on el salt costava més car: els botons són de 62 px i
 * apareixien sota el dit de qui ja estava esperant per validar.
 */
function QueueSkeleton() {
  return (
    <Skeleton className="py-8">
      <SkeletonBar w="w-full" h="h-[250px]" />
      <div className="mt-7 flex items-baseline justify-between gap-5">
        <SkeletonBar w="w-[58%]" h="h-[18px]" />
        <SkeletonBar w="w-[46px]" h="h-[18px]" className="flex-none" />
      </div>
      <SkeletonBar w="w-[70%]" h="h-[10px]" className="mt-2" />
      <div className="mt-7 grid grid-cols-2 gap-5">
        <SkeletonBar w="w-full" h="h-[62px]" />
        <SkeletonBar w="w-full" h="h-[62px]" />
      </div>
    </Skeleton>
  )
}
