import { useTranslation } from 'react-i18next'

import { Avatar } from '@/ui/Avatar/Avatar'

import type { Ride } from './api'

/**
 * A car, with the people in it around it.
 *
 * The idea is the president's: a list of names says who, and a picture says who
 * is going with whom, which is the thing anybody actually wants to know before
 * a two-hour drive.
 *
 * The geometry is fixed rather than computed, and on purpose. Five slots — the
 * driver on the left and four seats around the car — is exactly what the form
 * offers, so there is no arrangement to solve and no case where a sixth bubble
 * has to go somewhere ugly. If the seat count ever grows past four, this is the
 * file that has to be told.
 *
 * The bubble is the avatar and not the door photo. It looks the same and it
 * changes nothing about who can see whose face.
 */

/**
 * Where each bubble sits, in the box the gutter leaves at 390px.
 *
 * The design draws the box 220 tall. It is 244 here because a bottom bubble
 * can carry a second line — "guardada" — which the design never had to fit,
 * and without the room that label lands on the facts underneath.
 */
const DRIVER = { left: 18, top: 0, size: 52 }
const SEATS = [
  { left: 152, top: 4 },
  { left: 282, top: 4 },
  { left: 86, top: 152 },
  { left: 216, top: 152 },
] as const

export function CarDrawing({
  ride,
  meId,
}: {
  readonly ride: Ride
  readonly meId: string
}) {
  const { t } = useTranslation()
  // Oldest first, so somebody's bubble does not move when the next person gets
  // in. Where you sit is not information, but a face that jumps is noise.
  const riders = [...ride.seats].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const free = Math.max(0, ride.places - riders.length)

  return (
    <div className="relative mt-6 h-[244px]">
      {/* The car itself: roof, body with its capacity, two wheels. */}
      <div aria-hidden="true" className="absolute top-[72px] left-[75px] h-[86px] w-[200px]">
        <span className="absolute top-0 left-[45px] box-border h-[38px] w-[110px] rounded-t-[16px] border-[1.5px] border-b-0 border-[var(--ds-car-line)] bg-[var(--ds-car-body)]" />
        <span className="absolute top-[34px] left-0 box-border flex h-[40px] w-[200px] items-center justify-center rounded-[10px] border-[1.5px] border-[var(--ds-car-line)] bg-[var(--ds-car-body)] text-[10.5px] font-extrabold tracking-[0.16em] text-[var(--ds-text-faint)] uppercase">
          {t('rides.capacity', { count: ride.places + 1 })}
        </span>
        <span className="absolute top-[62px] left-[34px] box-border size-[24px] rounded-full border-[3px] border-[var(--ds-car-wheel)] bg-[var(--ds-bg-root)]" />
        <span className="absolute top-[62px] left-[142px] box-border size-[24px] rounded-full border-[3px] border-[var(--ds-car-wheel)] bg-[var(--ds-bg-root)]" />
      </div>

      <Bubble
        left={DRIVER.left}
        top={DRIVER.top}
        size={DRIVER.size}
        src={ride.driver?.avatar_url ?? null}
        name={ride.driver_id === meId ? t('rides.you') : (ride.driver?.nombre ?? '')}
        role={t('rides.drives')}
        ringed
      />

      {SEATS.map((slot, index) => {
        const rider = riders[index]
        if (rider !== undefined) {
          const isMe = rider.user_id === meId
          return (
            <Bubble
              key={rider.user_id}
              left={slot.left}
              top={slot.top}
              size={46}
              src={rider.profiles?.avatar_url ?? null}
              name={isMe ? t('rides.you') : (rider.profiles?.nombre ?? '')}
              role={rider.estat === 'convidat' ? t('rides.held') : undefined}
              ringed={isMe}
              highlight={isMe}
              // A held seat is dimmed: somebody is keeping it, and nobody has
              // said that person is coming.
              faded={rider.estat === 'convidat'}
            />
          )
        }
        // An empty slot is only drawn while there is a seat left to fill. Four
        // dashed circles under a full car would read as four people missing.
        return index < riders.length + free ? (
          <Empty key={`free-${String(index)}`} left={slot.left} top={slot.top} />
        ) : null
      })}
    </div>
  )
}

function Bubble({
  left,
  top,
  size,
  src,
  name,
  role,
  ringed = false,
  highlight = false,
  faded = false,
}: {
  readonly left: number
  readonly top: number
  readonly size: number
  readonly src: string | null
  readonly name: string
  readonly role?: string | undefined
  readonly ringed?: boolean
  readonly highlight?: boolean
  readonly faded?: boolean
}) {
  return (
    <div className={`absolute ${faded ? 'opacity-55' : ''}`} style={{ left, top, width: size }}>
      <span
        className={
          'block rounded-full ' +
          (ringed ? 'outline-2 outline-offset-2 outline-brand' : '')
        }
      >
        <Avatar src={src} size={size} />
      </span>
      {/* Wider than the bubble and centred on it, so a long first name does not
          shove the next one along. */}
      <span
        className="mt-4 block w-[76px] text-center text-[11px] font-bold"
        style={{ marginLeft: (size - 76) / 2 }}
      >
        <span className={highlight ? 'text-[var(--ds-brand-label-hi)]' : ''}>{name}</span>
      </span>
      {role === undefined ? null : (
        <span
          className={
            'block w-[76px] text-center text-[9.5px] font-extrabold tracking-[0.1em] uppercase ' +
            (faded ? 'text-[var(--ds-text-muted-lo)]' : 'text-brand-accent')
          }
          style={{ marginLeft: (size - 76) / 2 }}
        >
          {role}
        </span>
      )}
    </div>
  )
}

function Empty({ left, top }: { readonly left: number; readonly top: number }) {
  const { t } = useTranslation()
  return (
    <div className="absolute" style={{ left, top, width: 46 }}>
      <span
        aria-hidden="true"
        className="grid size-[46px] place-items-center rounded-full border-[1.5px] border-dashed border-surface-8 text-lg text-fg-faint"
      >
        +
      </span>
      <span className="mt-4 -ml-[15px] block w-[76px] text-center text-[10px] font-semibold text-[var(--ds-text-faint)]">
        {t('rides.freeSeat')}
      </span>
    </div>
  )
}
