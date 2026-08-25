import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useUserId } from '@/features/session/useUserId'
import { Avatar } from '@/ui/Avatar/Avatar'

import { fetchRides, rideKeys } from './api'

/**
 * The way in to the cars, from the event.
 *
 * Cars are not a tab: they only exist for events somebody has to drive to, and
 * they open a screen of their own because three cars with their faces do not
 * fit under a description.
 *
 * What goes here is the smallest thing that makes somebody tap: how many cars,
 * how many seats, and a row of faces so it reads as people rather than as
 * logistics. Everything else is one tap away.
 */

const GUTTER = 'px-[var(--ds-gutter)]'
const FACES = 6

export function RidesBlock({ eventId }: { readonly eventId: string }) {
  const { t } = useTranslation()
  const meId = useUserId()

  const rides = useQuery({
    queryKey: rideKeys.list(eventId),
    queryFn: () => fetchRides(eventId),
    enabled: eventId !== '',
  })

  const rows = rides.data ?? []
  const seats = rows.flatMap((r) => r.seats)
  const riding = rows.length + seats.length
  const free = rows.reduce((n, r) => n + Math.max(0, r.places - r.seats.length), 0)
  const iAmIn = rows.some((r) => r.driver_id === meId) || seats.some((s) => s.user_id === meId)

  const faces = [
    ...rows.map((r) => ({ id: r.driver_id, url: r.driver?.avatar_url ?? null })),
    ...seats.map((s) => ({ id: s.user_id, url: s.profiles?.avatar_url ?? null })),
  ].slice(0, FACES)

  return (
    <section className={`pt-12 ${GUTTER}`}>
      <h2 className="eyebrow text-fg-muted">{t('rides.blockTitle')}</h2>

      {/* Never hidden while loading. A block that appears late is a block
          somebody has already scrolled past. */}
      {rides.isError ? (
        <p className="mt-6 text-base text-fg-secondary [text-wrap:pretty]">
          {t('rides.failedSub')}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-base text-fg-secondary [text-wrap:pretty]">
          {rides.isPending ? t('rides.loading') : t('rides.emptyLede')}
        </p>
      ) : (
        <>
          <div className="mt-6 flex items-center gap-5">
            <span className="flex flex-none items-center">
              {faces.map((f, index) => (
                <span
                  key={`${f.id}-${String(index)}`}
                  className={index === 0 ? '' : '-ml-5'}
                  style={{ zIndex: FACES - index }}
                >
                  <Avatar src={f.url} size={34} />
                </span>
              ))}
            </span>
            <span className="min-w-0 flex-1 text-base font-bold [text-wrap:pretty]">
              {`${t('rides.cars', { count: rows.length })}, ${t('rides.riding', { count: riding })}`}
            </span>
          </div>
          <p className="mt-4 text-sm text-fg-muted [text-wrap:pretty]">
            {free === 0 ? t('rides.seatsNone') : t('rides.seatsLeft', { count: free })}
          </p>
        </>
      )}

      <Link
        to={`/esdeveniment/${eventId}/cotxes`}
        className="mt-7 flex min-h-[54px] w-full items-center justify-between gap-5 border-[1.5px] border-surface-7 px-7 text-lg font-bold text-fg no-underline"
      >
        <span className="min-w-0 flex-1 [text-wrap:balance]">
          {iAmIn ? t('rides.title') : rows.length === 0 ? t('rides.offerShort') : t('rides.goUp')}
        </span>
        <span aria-hidden="true" className="flex-none text-2xl text-[var(--ds-text-muted-lo)]">
          ›
        </span>
      </Link>
    </section>
  )
}
