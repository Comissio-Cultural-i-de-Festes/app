import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { eventKeys, fetchEvent } from '@/features/event/api'
import { formatTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { useAvailability } from '@/lib/useAvailability'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Confirm } from '@/ui/Confirm/Confirm'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { JuntaHeader } from './JuntaHeader'
import { type CheckinRow, checkinKeys, fetchCheckins, undoCheckin } from './checkinsApi'

/**
 * La revisió, que és per treure i no per donar.
 *
 * Els punts ja hi són quan algú arriba aquí: aquesta pantalla no aprova res,
 * només permet desfer. És la feina proporcional als problemes en comptes de
 * proporcional a la gent — mirar cent fitxatges no ho faria ningú, i una
 * llista ordenada per distància sí.
 *
 * Ordenada de més lluny a més a prop, que la fa el servidor: el que s'ha de
 * mirar primer és el que costa més d'explicar.
 *
 * TREURE ÉS DEMANAR-HO DUES VEGADES. Un toc obre la confirmació a la fila i el
 * servidor no sap res fins al segon. S'ha triat això i no un «Desfés» de cinc
 * segons com el de l'alta a mà perquè aquell desfà una cosa que es va fer
 * ara mateix, i aquí no: cap RPC torna a crear un fitxatge vell amb els seus
 * punts, la seva hora i el seu motiu originals, i endarrerir l'esborrat
 * deixaria una crida en vol penjada d'una pestanya oberta — si es tanca
 * l'app als cinc segons ningú sabria si va sortir. La confirmació no deixa
 * res a mitges: o s'ha confirmat i ha sortit, o no ha passat res.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function CheckinsScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.language)
  const { id } = useParams()
  const eventId = id ?? ''
  const client = useQueryClient()

  const event = useQuery({
    queryKey: eventKeys.one(eventId),
    queryFn: () => fetchEvent(eventId),
    enabled: eventId !== '',
  })
  const rows = useQuery({
    queryKey: checkinKeys.list(eventId),
    queryFn: () => fetchCheckins(eventId),
    enabled: eventId !== '',
  })

  const [confirming, setConfirming] = useState<string | null>(null)

  // `networkMode: 'always'` perquè sense cobertura React Query no cridaria res
  // i la confirmació es quedaria amb els dos botons morts i cap frase. Així la
  // crida surt, falla i la pantalla diu que no s'ha pogut.
  const undo = useMutation({
    networkMode: 'always',
    mutationFn: (userId: string) => undoCheckin(eventId, userId),
    onSuccess: async () => {
      setConfirming(null)
      await client.invalidateQueries({ queryKey: checkinKeys.list(eventId) })
    },
  })

  const view = useAvailability(rows)
  const list = rows.data ?? []

  return (
    <main className="min-h-dvh bg-app">
      <JuntaHeader viaHistory
        to={`/junta/esdeveniment/${eventId}`}
        label={event.data?.titulo ?? t('actions.back')}
        title={t('junta.checkins.title')}
        className="lg:hidden"
      />

      <p className={`pt-7 text-sm text-fg-secondary [text-wrap:pretty] ${GUTTER}`}>
        {t('junta.checkins.lede')}
      </p>

      {view.loading ? (
        <CheckinsSkeleton />
      ) : view.unavailable ? (
        <p
          role="alert"
          className={`pt-10 text-md font-bold text-error [text-wrap:pretty] ${GUTTER}`}
        >
          {t(view.messageKey)}
        </p>
      ) : list.length === 0 ? (
        <p className={`pt-10 text-md text-fg-muted [text-wrap:pretty] ${GUTTER}`}>
          {t('junta.checkins.nobody')}
        </p>
      ) : (
        <ul className="pt-7">
          {list.map((r) => (
            <li
              key={r.user_id}
              className={`flex flex-wrap items-center gap-5 border-b border-surface-4 py-6 ${GUTTER}`}
            >
              <Avatar src={r.avatar_url} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-fg">{r.nombre}</span>
                <span className="mt-2 block text-sm-lo text-fg-muted">{facts(r, locale, t)}</span>
              </span>
              <button
                type="button"
                disabled={undo.isPending}
                onClick={() => {
                  undo.reset()
                  setConfirming(r.user_id)
                }}
                className="min-h-[44px] flex-none px-3 text-sm font-bold text-warning disabled:opacity-50"
              >
                {t('junta.checkins.undo')}
              </button>
              {confirming === r.user_id ? (
                <Confirm
                  className="basis-full"
                  cta={t('junta.checkins.undoConfirm')}
                  cancel={t('actions.cancel')}
                  busy={undo.isPending}
                  onConfirm={() => {
                    undo.mutate(r.user_id)
                  }}
                  onCancel={() => {
                    setConfirming(null)
                  }}
                >
                  <p className="text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
                    {t('junta.checkins.undoSure', { nombre: r.nombre })}
                  </p>
                </Confirm>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {undo.isError ? (
        <p
          role="alert"
          className={`pt-7 text-md font-bold text-error [text-wrap:pretty] ${GUTTER}`}
        >
          {t(errorKey(undo.error))}
        </p>
      ) : null}
    </main>
  )
}

type T = ReturnType<typeof useTranslation>['t']

/**
 * L'hora, per on va entrar i a quants metres.
 *
 * Els metres només per als de la ubicació: en un fitxatge per QR la distància
 * és null i posar-hi «0 m» diria que es va comprovar una cosa que no es va
 * comprovar.
 */
function facts(r: CheckinRow, locale: ReturnType<typeof toLocale>, t: T): string {
  const parts = [
    r.checked_in_at === null ? null : formatTime(new Date(r.checked_in_at), locale),
    r.checkin_via === null ? null : t(`junta.checkins.via.${r.checkin_via}`),
    r.checkin_via === 'ubicacio' && r.checkin_dist_m !== null
      ? t('junta.checkins.metres', { count: Math.round(r.checkin_dist_m) })
      : null,
    r.was_registered === false ? t('junta.checkins.walkin') : null,
  ]
  return parts.filter((p): p is string => p !== null).join(' · ')
}

/** Cara, nom, i la línia de l'hora i la porta; i el «desfés» a la dreta. */
function CheckinsSkeleton() {
  return (
    <Skeleton className="pt-7">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={`flex items-center gap-5 border-b border-surface-4 py-6 ${GUTTER}`}>
          <SkeletonBar w="w-[36px]" h="h-[36px]" className="flex-none rounded-round" />
          <div className="min-w-0 flex-1">
            <SkeletonBar w="w-[55%]" h="h-[14px]" />
            <SkeletonBar w="w-[75%]" h="h-[10px]" className="mt-3" />
          </div>
          <SkeletonBar w="w-[46px]" h="h-[13px]" className="flex-none" />
        </div>
      ))}
    </Skeleton>
  )
}
