import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { env } from '@/config/env'
import { doorKeys } from '@/features/door/api'
import { eventKeys, fetchEvent } from '@/features/event/api'
import { fetchPointValues } from '@/features/junta/eventFormApi'
import { JuntaHeader } from '@/features/junta/JuntaHeader'
import { useUserId } from '@/features/session/useUserId'
import { formatTime, formatWeekdayLong } from '@/i18n/format'
import { type Locale, toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { type JoinResult, type Ride, fetchRides, joinRide, leaveRide, rideKeys } from './api'
import { CarDrawing } from './CarDrawing'

/**
 * Who is driving, and who is going with whom.
 *
 * One car per row rather than a sideways scroll: three full cars is the normal
 * case for a casa rural, and a row that slides is a row whose second half
 * nobody reads.
 *
 * Empty and failed say different things, and the empty one does the work. "No
 * cars yet" on the day the trip is announced is the moment somebody with a car
 * decides whether to offer it, so it asks.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function RidesScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const { eventId } = useParams()
  const id = eventId ?? ''
  const meId = useUserId()
  const client = useQueryClient()
  const [note, setNote] = useState<JoinResult | null>(null)

  const event = useQuery({
    queryKey: eventKeys.one(id),
    queryFn: () => fetchEvent(id),
    enabled: id !== '',
  })
  const rides = useQuery({
    queryKey: rideKeys.list(id),
    queryFn: () => fetchRides(id),
    enabled: id !== '',
  })
  const values = useQuery({ queryKey: doorKeys.pointValues(), queryFn: fetchPointValues })

  const reward = values.data?.find((v) => v.mena === 'motiu' && v.clau === 'conduir')?.punts ?? null
  const points = reward === null ? '' : t('units.points', { count: reward })

  const join = useMutation({
    mutationFn: joinRide,
    onSuccess: async (result) => {
      // Everything except `a_dins` is an answer worth reading, not a failure.
      setNote(result === 'a_dins' ? null : result)
      await client.invalidateQueries({ queryKey: rideKeys.list(id) })
    },
  })
  const leave = useMutation({
    mutationFn: (rideId: string) => leaveRide(rideId, meId),
    onSuccess: async () => {
      setNote(null)
      await client.invalidateQueries({ queryKey: rideKeys.list(id) })
    },
  })

  const rows = rides.data ?? []
  const seatsLeft = rows.reduce((n, r) => n + Math.max(0, r.places - r.seats.length), 0)

  return (
    <main className="with-tabbar min-h-dvh bg-app">
      <JuntaHeader
        to={`/esdeveniment/${id}`}
        label={event.data?.titulo ?? t('actions.back')}
        title={t('rides.title')}
      />

      <div className={`pt-6 ${GUTTER}`}>
        <p className="text-base text-fg-secondary [text-wrap:pretty]">
          {rides.isSuccess && rows.length > 0
            ? `${t('rides.cars', { count: rows.length })} · ${
                seatsLeft === 0 ? t('rides.seatsNone') : t('rides.seatsLeft', { count: seatsLeft })
              }`
            : t('rides.lede')}
        </p>

        {/* Never waits for the list: somebody who came here to offer a car
            should not be held up by a count. */}
        <Link
          to={`/esdeveniment/${id}/cotxes/nou`}
          className="mt-8 inline-flex min-h-[50px] items-center border-[1.5px] border-[var(--ds-border-input)] px-7 text-md font-bold text-fg no-underline [text-wrap:balance]"
        >
          {points === '' ? t('rides.offerShort') : t('rides.offer', { points })}
        </Link>

        {note === null ? null : (
          <p
            role="status"
            className="pt-7 text-md font-bold text-[var(--ds-warning)] [text-wrap:pretty]"
          >
            {t(`rides.${noteKey(note)}`)}
          </p>
        )}
        {join.isError || leave.isError ? (
          <p role="alert" className="pt-7 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(join.error ?? leave.error))}
          </p>
        ) : null}
      </div>

      {rides.isPending ? (
        <>
          <p className={`pt-9 text-sm text-fg-muted ${GUTTER}`}>{t('rides.loading')}</p>
          <RidesSkeleton />
          <p
            className={`pt-6 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty] ${GUTTER}`}
          >
            {t('rides.loadingNote')}
          </p>
        </>
      ) : rides.isError ? (
        <Failed error={rides.error} onRetry={() => void rides.refetch()} />
      ) : rows.length === 0 ? (
        <Empty points={points} eventId={id} />
      ) : (
        <>
          {rows.length === 1 ? (
            <p className={`pt-9 text-md text-fg-secondary [text-wrap:pretty] ${GUTTER}`}>
              {t('rides.onlyOne')}
            </p>
          ) : null}

          {rows.map((ride) => (
            <Card
              key={ride.id}
              ride={ride}
              meId={meId}
              locale={locale}
              busy={join.isPending || leave.isPending}
              onJoin={() => {
                setNote(null)
                join.mutate(ride.id)
              }}
              onLeave={() => {
                leave.mutate(ride.id)
              }}
            />
          ))}

          {rows.length === 1 && rows[0]?.seats.length === 0 ? (
            <p
              className={`pt-6 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty] ${GUTTER}`}
            >
              {t('rides.beFirst')}
            </p>
          ) : null}
        </>
      )}
    </main>
  )
}

/** Which sentence a verdict gets. `a_dins` never reaches here. */
function noteKey(result: JoinResult): string {
  if (result === 'sense_places') return 'noRoom'
  if (result === 'ja_hi_ets') return 'alreadyIn'
  if (result === 'altre_cotxe') return 'otherCar'
  if (result === 'ets_el_conductor') return 'imDriver'
  return 'gone'
}

function Card({
  ride,
  meId,
  locale,
  busy,
  onJoin,
  onLeave,
}: {
  readonly ride: Ride
  readonly meId: string
  readonly locale: Locale
  readonly busy: boolean
  readonly onJoin: () => void
  readonly onLeave: () => void
}) {
  const { t } = useTranslation()
  const free = Math.max(0, ride.places - ride.seats.length)
  const mySeat = ride.seats.find((s) => s.user_id === meId) ?? null
  const iAmIn = mySeat !== null && mySeat.estat === 'a_dins'
  const heldForMe = mySeat !== null && mySeat.estat === 'convidat'
  const iDrive = ride.driver_id === meId
  const when = ride.hora_sortida === null ? null : new Date(ride.hora_sortida)

  return (
    <section className={`border-t border-surface-5 pt-7 pb-8 ${GUTTER}`}>
      <div className="flex items-baseline justify-between gap-5">
        <h2 className="text-lg font-bold tracking-[-0.01em] [text-wrap:balance]">
          {t('rides.carOf', { who: iDrive ? t('rides.you') : (ride.driver?.nombre ?? '') })}
        </h2>
        <span className="eyebrow flex-none text-fg-muted">
          {free === 0 ? t('rides.full') : t('rides.seatsLeft', { count: free })}
        </span>
      </div>

      <CarDrawing ride={ride} meId={meId} />

      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-4">
        <Fact label={t('rides.from')} value={ride.origen} />
        <Fact
          label={t(`rides.sentit.${ride.sentit}`)}
          value={
            when === null ? '—' : `${formatWeekdayLong(when, locale)} ${formatTime(when, locale)}`
          }
        />
      </dl>

      {ride.notes === null ? null : (
        <p className="mt-6 text-sm text-fg-secondary [text-wrap:pretty]">{ride.notes}</p>
      )}

      {/* Somebody is keeping this seat for me. Taking it is the same button as
          anywhere else — join_ride recognises the held seat and converts it —
          but it is worth saying who, because that is why it is there. */}
      {heldForMe ? (
        <div className="mt-7 border-l-[3px] border-brand bg-surface-1 px-6 py-6">
          <p className="text-md font-bold [text-wrap:balance]">{t('rides.yourSeat')}</p>
          <p className="mt-3 text-sm text-fg-secondary [text-wrap:pretty]">
            {t('rides.yourSeatSub', { who: ride.driver?.nombre ?? '' })}
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <button
              type="button"
              disabled={busy}
              onClick={onJoin}
              className="min-h-[48px] flex-1 bg-brand-cta px-5 text-md font-bold text-on-brand disabled:opacity-50"
            >
              {t('rides.takeIt')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onLeave}
              className="min-h-[48px] flex-none border-[1.5px] border-surface-7 px-5 text-md font-bold text-fg-secondary disabled:opacity-60"
            >
              {t('rides.declineIt')}
            </button>
          </div>
        </div>
      ) : iDrive ? (
        <Link
          to={`/esdeveniment/${ride.event_id}/cotxes/${ride.id}`}
          className="mt-7 flex min-h-[54px] w-full items-center justify-center border-[1.5px] border-[var(--ds-border-input)] px-6 text-lg font-bold text-fg no-underline [text-wrap:balance]"
        >
          {t('rides.mine')}
        </Link>
      ) : iAmIn ? (
        <button
          type="button"
          disabled={busy}
          onClick={onLeave}
          className="mt-7 min-h-[54px] w-full border-[1.5px] border-[var(--ds-border-input)] px-6 text-lg font-bold text-fg-secondary [text-wrap:balance] disabled:opacity-60"
        >
          {t('rides.leave')}
        </button>
      ) : (
        <button
          type="button"
          disabled={busy || free === 0}
          onClick={onJoin}
          className="mt-7 min-h-[54px] w-full bg-brand-cta px-6 text-lg font-bold text-on-brand [text-wrap:balance] disabled:opacity-50"
        >
          {free === 0 ? t('rides.full') : t('rides.join')}
        </button>
      )}
    </section>
  )
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="eyebrow text-[var(--ds-text-muted-lo)]">{label}</dt>
      <dd className="mt-2 text-base font-semibold [text-wrap:pretty]">{value}</dd>
    </div>
  )
}

/**
 * Nobody has offered one.
 *
 * The day a trip goes up is the day somebody with a car decides whether to
 * mention it, so this asks rather than reporting. The points line is here and
 * not in a footnote because for one particular person it is the whole argument.
 */
function Empty({ points, eventId }: { readonly points: string; readonly eventId: string }) {
  const { t } = useTranslation()
  return (
    <section className={`pt-9 ${GUTTER}`}>
      <p className="text-lg font-bold [text-wrap:balance]">{t('rides.emptyTitle')}</p>
      <p className="mt-5 text-md text-fg-secondary [text-wrap:pretty]">{t('rides.emptyLede')}</p>
      <Link
        to={`/esdeveniment/${eventId}/cotxes/nou`}
        className="mt-8 flex min-h-[56px] w-full items-center justify-center bg-brand-cta px-8 text-lg font-bold text-on-brand no-underline [text-wrap:balance]"
      >
        {t('rides.offerShort')}
      </Link>
      {points === '' ? null : (
        <p className="mt-6 text-sm text-success [text-wrap:pretty]">
          {t('rides.emptyFoot', { points })}
        </p>
      )}
      <p className="mt-8 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {t('rides.emptyNote')}
      </p>
    </section>
  )
}

/**
 * Not "no cars".
 *
 * And it says the one thing somebody in this state actually needs: a seat you
 * already had is still yours. The way out is the group chat, which is where
 * this gets sorted when the app cannot help.
 */
function Failed({ error, onRetry }: { readonly error: unknown; readonly onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <section className={`pt-9 ${GUTTER}`}>
      <p role="alert" className="eyebrow text-[var(--ds-warning)]">
        {t('rides.failed')}
      </p>
      <p className="mt-5 text-md text-fg-secondary [text-wrap:pretty]">{t('rides.failedSub')}</p>
      <p className="mt-3 text-sm text-fg-muted [text-wrap:pretty]">{t(errorKey(error))}</p>

      <div className="mt-8 flex flex-wrap gap-5">
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[50px] flex-1 border-[1.5px] border-[var(--ds-warning)] px-6 text-md font-bold text-[var(--ds-warning)]"
        >
          {t('actions.retry')}
        </button>
        {env.whatsappUrl === null ? null : (
          <a
            href={env.whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[50px] flex-1 items-center justify-center border-[1.5px] border-surface-7 px-6 text-md font-bold text-fg-secondary no-underline"
          >
            {t('rides.failedGroup')}
          </a>
        )}
      </div>

      <p className="mt-6 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {t('rides.failedKeep')}
      </p>
    </section>
  )
}

function RidesSkeleton() {
  return (
    <Skeleton className={`pt-4 ${GUTTER}`}>
      <SkeletonBar w="w-[55%]" h="h-[16px]" />
      <SkeletonBar w="w-full" h="h-[110px]" className="mt-8" />
      <SkeletonBar w="w-full" h="h-[54px]" className="mt-8" />
    </Skeleton>
  )
}
