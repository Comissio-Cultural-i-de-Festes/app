import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { eventKeys, fetchEvent } from '@/features/event/api'
import { type RosterRow, closeMeeting, fetchRoster, meetingKeys } from '@/features/event/meetingApi'
import { eventTitle } from '@/features/event/title'
import { formatDateTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { JuntaHeader } from './JuntaHeader'
import { INPUT } from './formBits'
import { juntaHomeKeys } from './homeApi'
import { meetingListKeys } from './meetingsApi'

/**
 * Tanca la reunió, i és aquí on es donen els punts.
 *
 * NO ELS DÓNA CAP QR I MAI EN CONFIRMAR. «Qui diu que hi serà i no hi és, no
 * en fa»: el que compta és qui hi era de debò, i això només ho sap qui hi era.
 * Per això aquesta pantalla existeix en comptes de deixar que la porta ho
 * resolgui com amb una festa.
 *
 * LA LLISTA ARRENCA AMB QUI HAVIA DIT QUE SÍ, i no en blanc ni amb tothom
 * marcat. En blanc obliga a marcar tres persones que ja havien contestat; amb
 * tothom marcat, el camí ràpid és premre el botó i pagar a qui no hi era. El
 * que havien dit és la millor conjectura, i canviar-la és un toc.
 *
 * ES POT TORNAR A TANCAR. `points_log_asistencia_unic` fa que no es pagui dues
 * vegades, i treure algú de la llista el deixa de comptar: la RPC posa a 'no'
 * qui ja no hi surti. Per tant equivocar-se aquí es corregeix tornant-hi, que
 * és el que la frase de sota del botó promet.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

function CloseSkeleton() {
  return (
    <Skeleton className="min-h-dvh bg-app">
      <div className={`pt-8 ${GUTTER}`}>
        <SkeletonBar w="w-[40%]" h="h-[12px]" />
        <SkeletonBar w="w-[72%]" h="h-[20px]" className="mt-4" />
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="mt-6 flex min-h-[60px] items-center gap-5 border-b border-surface-4 px-[var(--ds-gutter)] py-6"
        >
          <SkeletonBar w="w-[26px]" h="h-[26px]" className="flex-none rounded-round" />
          <SkeletonBar w="w-[36px]" h="h-[36px]" className="flex-none rounded-round" />
          <div className="min-w-0 flex-1">
            <SkeletonBar w="w-[46%]" h="h-[15px]" />
            <SkeletonBar w="w-[62%]" h="h-[11px]" className="mt-[2px]" />
          </div>
          <SkeletonBar w="w-[28px]" h="h-[16px]" className="flex-none" />
        </div>
      ))}
    </Skeleton>
  )
}

export function CloseMeetingScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const client = useQueryClient()

  const event = useQuery({ queryKey: eventKeys.one(id), queryFn: () => fetchEvent(id) })
  const roster = useQuery({ queryKey: meetingKeys.roster(id), queryFn: () => fetchRoster(id) })

  // `null` fins que la llista arriba: així el valor per defecte es calcula un
  // sol cop des de les dades i no cal cap efecte que el sincronitzi.
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null)
  const [acta, setActa] = useState('')

  const close = useMutation({
    mutationFn: (ids: readonly string[]) => closeMeeting(id, ids, acta),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: meetingKeys.roster(id) })
      await client.invalidateQueries({ queryKey: eventKeys.one(id) })
      await client.invalidateQueries({ queryKey: meetingListKeys.list() })
      await client.invalidateQueries({ queryKey: juntaHomeKeys.home() })
      await navigate('/junta')
    },
  })

  if (event.isPending || roster.isPending) return <CloseSkeleton />

  const e = event.data
  if (e === null || e === undefined) {
    return (
      <main className="min-h-dvh bg-app">
        <JuntaHeader to="/junta" label={t('junta.back')} title={t('meeting.closeTitle')} />
        <p role="alert" className={`pt-8 text-md font-bold text-error ${GUTTER}`}>
          {t('errors.notFound')}
        </p>
      </main>
    )
  }

  const rows = roster.data ?? []
  // Qui havia dit que hi seria, o qui ja consta que hi era si això és una
  // segona passada.
  const suggested = new Set(
    rows.filter((r) => r.estado === 'si' || r.estado === 'asistio').map((r) => r.user_id),
  )
  const chosen = picked ?? suggested
  const punts = e.puntos

  const toggle = (userId: string) => {
    const next = new Set(chosen)
    if (next.has(userId)) next.delete(userId)
    else next.add(userId)
    setPicked(next)
  }

  return (
    <main className="min-h-dvh bg-app pb-14">
      <JuntaHeader to="/junta" label={t('junta.back')} title={t('meeting.closeTitle')} />

      <div className={`pt-8 ${GUTTER}`}>
        <p className="eyebrow-sm text-fg-muted">{formatDateTime(new Date(e.starts_at), locale)}</p>
        <p className="mt-4 text-xl leading-[1.2] font-bold [text-wrap:pretty]">
          {eventTitle(e.titulo)}
        </p>
        <p className="mt-6 text-md text-fg-secondary [text-wrap:pretty]">
          {punts > 0 ? t('meeting.closeLead') : t('meeting.closeLeadNoPoints')}
        </p>
      </div>

      <ul className="mt-10">
        {rows.map((row) => (
          <Row
            key={row.user_id}
            row={row}
            on={chosen.has(row.user_id)}
            punts={punts}
            onToggle={() => toggle(row.user_id)}
          />
        ))}
      </ul>

      <section className={`pt-9 ${GUTTER}`}>
        <div className="flex items-end gap-7">
          <div>
            <p className="tabular display text-d-md leading-[0.9] tracking-[-0.05em]">
              {chosen.size}
            </p>
            <p className="mt-[2px] text-sm font-bold text-fg-muted">
              {t('meeting.done', { quants: chosen.size, total: rows.length })}
            </p>
          </div>
          {punts > 0 ? (
            <div className="flex-1 pb-2">
              <p className="tabular text-xl font-extrabold text-success">
                {t('units.points', { count: chosen.size * punts })}
              </p>
              <p className="mt-[2px] text-sm font-semibold text-fg-muted [text-wrap:pretty]">
                {t('meeting.shared')}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className={`pt-12 ${GUTTER}`}>
        <span className="eyebrow block text-fg-muted">{t('meeting.actaLabel')}</span>
        <textarea
          value={acta}
          onChange={(ev) => setActa(ev.target.value)}
          rows={4}
          placeholder={t('meeting.actaPlaceholder')}
          className={`${INPUT} resize-y`}
        />
        <p className="mt-4 text-sm-lo leading-[1.4] text-fg-muted-lo [text-wrap:pretty]">
          {t('meeting.actaHint')}
        </p>
      </section>

      <section className={`pt-12 ${GUTTER}`}>
        <button
          type="button"
          disabled={close.isPending}
          onClick={() => close.mutate([...chosen])}
          className="flex min-h-[60px] w-full items-center justify-center rounded-cta border-0 bg-brand-cta px-7 py-9 font-body text-2xl font-bold text-on-brand shadow-brand disabled:opacity-45 [text-wrap:balance]"
        >
          {close.isPending
            ? t('state.saving')
            : punts > 0
              ? t('meeting.closeCta')
              : t('meeting.closeCtaNoPoints')}
        </button>
        <p className="mt-5 text-center text-sm-lo leading-[1.4] text-fg-muted-lo [text-wrap:pretty]">
          {t('meeting.closeAgain')}
        </p>

        {close.isError ? (
          <p role="alert" className="mt-5 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(close.error))}
          </p>
        ) : null}
      </section>
    </main>
  )
}

function Row({
  row,
  on,
  punts,
  onToggle,
}: {
  readonly row: RosterRow
  readonly on: boolean
  readonly punts: number
  readonly onToggle: () => void
}) {
  const { t } = useTranslation()

  return (
    <li>
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        className={
          'flex min-h-[60px] w-full items-center gap-5 border-0 border-b border-surface-4 px-[var(--ds-gutter)] py-6 text-left font-body ' +
          (on ? 'bg-[var(--ds-bg-paid)]' : 'bg-transparent')
        }
      >
        <span
          aria-hidden="true"
          className={
            'grid size-[26px] flex-none place-items-center rounded-full text-sm font-extrabold ' +
            (on
              ? 'bg-success text-app'
              : 'border-[1.5px] border-[var(--ds-border-input)] text-transparent')
          }
        >
          ✓
        </span>
        <Avatar src={row.avatar_url} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-fg">{row.nombre}</span>
          <span
            className={
              'mt-[2px] block text-sm-lo font-bold tracking-[0.06em] uppercase ' +
              (on ? 'text-success' : row.estado === 'no' ? 'text-warning-deep' : 'text-fg-muted-lo')
            }
          >
            {on
              ? t('meeting.wasThere')
              : row.estado === 'no'
                ? t('meeting.saidNoShort')
                : row.estado === 'si'
                  ? t('meeting.saidYesShort')
                  : t('meeting.noAnswer')}
          </span>
        </span>
        <span
          className={
            'tabular flex-none text-lg font-extrabold ' + (on ? 'text-success' : 'text-fg-dim')
          }
        >
          {on && punts > 0 ? `+${String(punts)}` : '—'}
        </span>
      </button>
    </li>
  )
}
