import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { eventKeys, fetchEvent } from '@/features/event/api'
import { formatTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Avatar } from '@/ui/Avatar/Avatar'

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

  const undo = useMutation({
    mutationFn: (userId: string) => undoCheckin(eventId, userId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: checkinKeys.list(eventId) })
    },
  })

  const list = rows.data ?? []

  return (
    <main className="min-h-dvh bg-app">
      <JuntaHeader
        to={`/junta/esdeveniment/${eventId}`}
        label={event.data?.titulo ?? t('actions.back')}
        title={t('junta.checkins.title')}
      />

      <p className={`pt-7 text-sm text-fg-secondary [text-wrap:pretty] ${GUTTER}`}>
        {t('junta.checkins.lede')}
      </p>

      {rows.isPending ? (
        <p className={`pt-10 text-fg-muted ${GUTTER}`}>{t('state.loading')}</p>
      ) : rows.isError ? (
        <p role="alert" className={`pt-10 text-md font-bold text-error [text-wrap:pretty] ${GUTTER}`}>
          {t(errorKey(rows.error))}
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
                <span className="mt-2 block text-[12.5px] text-fg-muted">
                  {facts(r, locale, t)}
                </span>
              </span>
              <button
                type="button"
                disabled={undo.isPending}
                onClick={() => {
                  undo.mutate(r.user_id)
                }}
                className="min-h-[44px] flex-none px-3 text-sm font-bold text-[var(--ds-warning)] disabled:opacity-50"
              >
                {t('junta.checkins.undo')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {undo.isError ? (
        <p role="alert" className={`pt-7 text-md font-bold text-error [text-wrap:pretty] ${GUTTER}`}>
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
