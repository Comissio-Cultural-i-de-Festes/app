import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { env } from '@/config/env'
import { eventKeys, fetchEvent } from '@/features/event/api'
import { JuntaHeader } from '@/features/junta/JuntaHeader'
import { useMyProfile } from '@/features/session/useMyProfile'
import { formatTime, formatWeekdayLong } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Avatar } from '@/ui/Avatar/Avatar'

import {
  type InviteResult,
  fetchCandidates,
  fetchPhones,
  fetchRides,
  inviteToRide,
  rideKeys,
  withdrawRide,
} from './api'

/**
 * The driver's own car, with the numbers.
 *
 * This is the only screen in the app that shows somebody else's phone number,
 * and it does it in one direction: a driver sees their passengers, passengers
 * see nobody, and an admin looking at the same car sees nobody either. The rule
 * is `ride_phones`, not this file — an empty list here means the function said
 * no, and there is nothing to filter.
 *
 * Telling everybody at once goes through WhatsApp, which is the association's
 * announcement channel and the only one that reaches everybody today. When push
 * notifications land it is the same button with a different engine behind it.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function MyRideScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const navigate = useNavigate()
  const { eventId, rideId } = useParams()
  const id = eventId ?? ''
  const ride = rideId ?? ''
  const client = useQueryClient()
  const { data: profile } = useMyProfile()
  const [confirming, setConfirming] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [query, setQuery] = useState('')
  const [held, setHeld] = useState<InviteResult | null>(null)

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
  const phones = useQuery({
    queryKey: rideKeys.phones(ride),
    queryFn: () => fetchPhones(ride),
    enabled: ride !== '',
  })

  const candidates = useQuery({
    queryKey: rideKeys.candidates(ride),
    queryFn: () => fetchCandidates(ride),
    enabled: ride !== '' && inviting,
  })

  const invite = useMutation({
    mutationFn: (userId: string) => inviteToRide(ride, userId),
    onSuccess: async (result) => {
      setHeld(result)
      if (result === 'convidat') {
        setInviting(false)
        setQuery('')
      }
      await client.invalidateQueries({ queryKey: rideKeys.list(id) })
      await client.invalidateQueries({ queryKey: rideKeys.candidates(ride) })
    },
  })

  const remove = useMutation({
    mutationFn: () => withdrawRide(ride),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: rideKeys.list(id) })
      await navigate(`/esdeveniment/${id}/cotxes`)
    },
  })

  const mine = rides.data?.find((r) => r.id === ride) ?? null
  const riders = phones.data ?? []
  const free = mine === null ? 0 : Math.max(0, mine.places - mine.seats.length)
  const when = mine?.hora_sortida === null || mine === null ? null : new Date(mine.hora_sortida)

  const nudge =
    env.whatsappUrl === null || mine === null
      ? null
      : `${env.whatsappUrl}${env.whatsappUrl.includes('?') ? '&' : '?'}text=${encodeURIComponent(
          t('rides.nudgeText', {
            who: profile?.nombre ?? '',
            event: event.data?.titulo ?? '',
            when:
              when === null ? '' : `${formatWeekdayLong(when, locale)} ${formatTime(when, locale)}`,
            from: mine.origen,
          }),
        )}`

  return (
    <main className="with-tabbar min-h-dvh bg-app">
      <JuntaHeader
        to={`/esdeveniment/${id}/cotxes`}
        label={t('rides.title')}
        title={t('rides.mine')}
      />

      {rides.isPending ? (
        <p className={`pt-9 text-fg-muted ${GUTTER}`}>{t('state.loading')}</p>
      ) : mine === null ? (
        <p role="alert" className={`pt-9 text-md font-bold text-[var(--ds-warning)] ${GUTTER}`}>
          {t('rides.gone')}
        </p>
      ) : (
        <>
          <div className={`pt-7 ${GUTTER}`}>
            <p className="text-lg font-bold [text-wrap:balance]">
              {riders.length === 0
                ? t('rides.nobodyYet')
                : t('rides.boarded', { count: riders.length })}
            </p>
            <p className="mt-3 text-md text-fg-secondary [text-wrap:pretty]">
              {[
                when === null
                  ? null
                  : `${formatWeekdayLong(when, locale)} ${formatTime(when, locale)}`,
                mine.origen,
                free === 0 ? t('rides.full') : t('rides.seatsLeft', { count: free }),
              ]
                .filter((s): s is string => s !== null)
                .join(' · ')}
            </p>
          </div>

          {riders.length === 0 ? null : (
            <ul className="mt-8">
              {riders.map((r) => (
                <li
                  key={r.user_id}
                  className={`flex min-h-[64px] items-center gap-5 border-t border-surface-4 py-6 ${GUTTER}`}
                >
                  <Avatar src={null} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold">{r.nombre}</span>
                    <span className="tabular mt-[2px] block text-[12.5px] text-[var(--ds-text-muted-lo)]">
                      {r.telefon ?? '—'}
                    </span>
                  </span>
                  {r.telefon === null ? null : (
                    <a
                      href={`tel:${r.telefon.replace(/\s/g, '')}`}
                      className="flex min-h-[44px] flex-none items-center border-[1.5px] border-surface-7 px-5 text-sm font-bold text-fg no-underline"
                    >
                      {t('rides.call')}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className={`pt-8 ${GUTTER}`}>
            <p className="text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
              {t('rides.driverPhones')}
            </p>

            {/* Holding a seat, not filling one. The sentence saying so is above
                the picker rather than under it: it is the whole difference
                between this and adding somebody to your car. */}
            {mine.seats.length >= mine.places ? null : inviting ? (
              <div className="mt-8 border-l-[3px] border-brand bg-surface-1 px-6 pt-6 pb-7">
                <p className="eyebrow text-fg-muted">{t('rides.holdFor')}</p>
                <p className="mt-3 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
                  {t('rides.holdNote')}
                </p>
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                  }}
                  placeholder={t('rides.inviteSearch')}
                  autoComplete="off"
                  className="mt-5 min-h-[48px] w-full border-[1.5px] border-surface-7 bg-surface-1 px-5 text-md font-semibold text-fg outline-none placeholder:font-medium placeholder:text-fg-faint"
                />
                <ul className="mt-4 max-h-[280px] overflow-y-auto">
                  {(candidates.data ?? [])
                    .filter((c) => c.nombre.toLowerCase().includes(query.trim().toLowerCase()))
                    .slice(0, 20)
                    .map((c) => (
                      <li key={c.user_id}>
                        <button
                          type="button"
                          disabled={invite.isPending}
                          onClick={() => {
                            invite.mutate(c.user_id)
                          }}
                          className="flex min-h-[52px] w-full items-center gap-4 border-b border-surface-4 text-left disabled:opacity-60"
                        >
                          <Avatar src={c.avatar_url} size={30} />
                          <span className="min-w-0 flex-1 truncate text-base font-semibold">
                            {c.nombre}
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
                {candidates.isSuccess && candidates.data.length === 0 ? (
                  <p className="mt-4 text-sm text-fg-muted [text-wrap:pretty]">
                    {t('rides.inviteNobody')}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setInviting(false)
                  }}
                  className="mt-5 min-h-[44px] text-md font-bold text-fg-muted"
                >
                  {t('actions.cancel')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setHeld(null)
                  setInviting(true)
                }}
                className="mt-8 min-h-[52px] w-full border-[1.5px] border-surface-7 px-6 text-md font-bold text-fg [text-wrap:balance]"
              >
                {t('rides.hold')}
              </button>
            )}

            {held === null ? null : (
              <p
                role="status"
                className="pt-6 text-md font-bold text-[var(--ds-warning)] [text-wrap:pretty]"
              >
                {t(held === 'convidat' ? 'rides.invitedOk' : `rides.${holdNoteKey(held)}`)}
              </p>
            )}
            {invite.isError ? (
              <p role="alert" className="pt-6 text-md font-bold text-error [text-wrap:pretty]">
                {t(errorKey(invite.error))}
              </p>
            ) : null}

            {nudge === null || riders.length === 0 ? null : (
              <a
                href={nudge}
                target="_blank"
                rel="noreferrer"
                className="mt-8 flex min-h-[52px] w-full items-center justify-center border-[1.5px] border-surface-7 px-6 text-md font-bold text-fg no-underline [text-wrap:balance]"
              >
                {t('rides.nudge')}
              </a>
            )}

            {remove.isError ? (
              <p role="alert" className="pt-6 text-md font-bold text-error [text-wrap:pretty]">
                {t(errorKey(remove.error))}
              </p>
            ) : null}

            {/* Taking the car back leaves people without a lift, and nothing
                tells them automatically — so the number of people it strands
                is on screen before the button, not after. */}
            {confirming ? (
              <div className="mt-8">
                <p className="text-md font-bold text-[var(--ds-warning)] [text-wrap:pretty]">
                  {t('rides.withdrawSure', { count: riders.length })}
                </p>
                <div className="mt-6 flex flex-wrap gap-4">
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => {
                      remove.mutate()
                    }}
                    className="min-h-[48px] flex-1 border-[1.5px] border-[var(--ds-warning)] px-5 text-md font-bold text-[var(--ds-warning)] disabled:opacity-60"
                  >
                    {t('rides.withdraw')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(false)
                    }}
                    className="min-h-[48px] flex-none px-5 text-md font-bold text-fg-muted"
                  >
                    {t('actions.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirming(true)
                }}
                className="mt-6 min-h-[48px] text-md font-bold text-fg-muted"
              >
                {t('rides.withdraw')}
              </button>
            )}
          </div>
        </>
      )}
    </main>
  )
}

/** Which sentence a refused hold gets. `convidat` never reaches here. */
function holdNoteKey(result: InviteResult): string {
  if (result === 'sense_places') return 'noRoom'
  if (result === 'ja_hi_ets') return 'alreadyIn'
  if (result === 'altre_cotxe') return 'otherCar'
  if (result === 'ets_el_conductor') return 'imDriver'
  return 'gone'
}
