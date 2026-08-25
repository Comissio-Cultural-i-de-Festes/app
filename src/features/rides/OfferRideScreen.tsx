import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { doorKeys } from '@/features/door/api'
import { eventKeys, fetchEvent } from '@/features/event/api'
import { fetchPointValues, fromLocalInput, toLocalInput } from '@/features/junta/eventFormApi'
import { Field, INPUT } from '@/features/junta/formBits'
import { JuntaHeader } from '@/features/junta/JuntaHeader'
import { useUserId } from '@/features/session/useUserId'
import { APP_TIME_ZONE } from '@/i18n/format'
import { errorKey } from '@/lib/errors'

import { type Sentit, offerRide, rideKeys } from './api'

/**
 * Four things, and one sentence about the phone numbers.
 *
 * The seat count is what you are giving away, not what the car holds — the
 * drawing adds the driver back. Offering one to four is what the design draws
 * and what the picture has room for; the column allows up to eight, and the day
 * somebody turns up with a van this form and CarDrawing both have to be told.
 *
 * The departure time is pre-filled from the event, because "an hour and a half
 * before" is what everybody means and nobody wants to type.
 */

const GUTTER = 'px-[var(--ds-gutter)]'
const SEATS = [1, 2, 3, 4] as const
const SENTITS: readonly Sentit[] = ['anada', 'tornada', 'anada_tornada']
const LEAD_MS = 90 * 60 * 1000

export function OfferRideScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { eventId } = useParams()
  const id = eventId ?? ''
  const meId = useUserId()
  const client = useQueryClient()

  const event = useQuery({
    queryKey: eventKeys.one(id),
    queryFn: () => fetchEvent(id),
    enabled: id !== '',
  })
  const values = useQuery({ queryKey: doorKeys.pointValues(), queryFn: fetchPointValues })
  const reward = values.data?.find((v) => v.mena === 'motiu' && v.clau === 'conduir')?.punts ?? null

  const [places, setPlaces] = useState(3)
  const [sentit, setSentit] = useState<Sentit>('anada_tornada')
  const [origen, setOrigen] = useState('')
  const [notes, setNotes] = useState('')
  const [hora, setHora] = useState<string | null>(null)

  // Derived until somebody types, so the field is not empty on a screen that
  // has an obvious answer. The same `edits ?? derived` shape as the event form.
  const starts =
    event.data === undefined || event.data === null ? null : new Date(event.data.starts_at)
  const suggested =
    starts === null
      ? ''
      : toLocalInput(new Date(starts.getTime() - LEAD_MS).toISOString(), APP_TIME_ZONE)
  const shown = hora ?? suggested

  const save = useMutation({
    mutationFn: () =>
      offerRide({
        eventId: id,
        driverId: meId,
        sentit,
        origen,
        places,
        horaSortida: shown === '' ? null : fromLocalInput(shown, APP_TIME_ZONE),
        notes: notes.trim() === '' ? null : notes.trim(),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: rideKeys.list(id) })
      await navigate(`/esdeveniment/${id}/cotxes`)
    },
  })

  const valid = origen.trim().length >= 2

  return (
    <main className="with-tabbar min-h-dvh bg-app">
      <JuntaHeader
        to={`/esdeveniment/${id}/cotxes`}
        label={t('rides.title')}
        title={t('rides.offerShort')}
      />

      <div className={`pt-8 ${GUTTER}`}>
        <p className="pb-8 text-md text-fg-secondary [text-wrap:pretty]">{t('rides.lede')}</p>

        <Field label={t('rides.howMany')}>
          <div className="mt-4 flex gap-4">
            {SEATS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={places === n}
                onClick={() => {
                  setPlaces(n)
                }}
                className={
                  'flex min-h-[48px] flex-1 items-center justify-center text-lg font-bold ' +
                  (places === n
                    ? 'bg-brand-cta text-on-brand'
                    : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg-secondary')
                }
              >
                {n}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t('rides.sentit.anada_tornada')}>
          <div className="mt-4 flex gap-4">
            {SENTITS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sentit === s}
                onClick={() => {
                  setSentit(s)
                }}
                className={
                  'flex min-h-[48px] flex-1 items-center justify-center px-2 text-md font-bold [text-wrap:balance] ' +
                  (sentit === s
                    ? 'bg-brand-cta text-on-brand'
                    : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg-secondary')
                }
              >
                {t(`rides.sentit.${s}`)}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t('rides.from')}>
          <input
            value={origen}
            onChange={(e) => {
              setOrigen(e.target.value)
            }}
            maxLength={120}
            placeholder={t('rides.fromPlaceholder')}
            className={INPUT}
          />
        </Field>

        <Field label={t('rides.at')}>
          <input
            type="datetime-local"
            value={shown}
            onChange={(e) => {
              setHora(e.target.value)
            }}
            className={INPUT}
          />
        </Field>

        <Field label={t('rides.notes')}>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
            }}
            rows={3}
            maxLength={500}
            placeholder={t('rides.notesPlaceholder')}
            className={`${INPUT} resize-y`}
          />
        </Field>

        {/* Said before the button. Somebody who did not expect to hand over a
            way of being phoned should find that out now. */}
        <p className="text-sm text-fg-muted [text-wrap:pretty]">{t('rides.phoneNote')}</p>

        {save.isError ? (
          <p role="alert" className="pt-6 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(save.error))}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!valid || save.isPending}
          onClick={() => {
            save.mutate()
          }}
          className="mt-8 min-h-[56px] w-full bg-brand-cta px-8 text-lg font-bold text-on-brand [text-wrap:balance] disabled:opacity-50"
        >
          {save.isPending ? t('state.updating') : t('rides.offerCta')}
        </button>

        {reward === null ? null : (
          <p className="mt-5 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
            {t('rides.pointsLater', { points: t('units.points', { count: reward }) })}
          </p>
        )}
      </div>
    </main>
  )
}
