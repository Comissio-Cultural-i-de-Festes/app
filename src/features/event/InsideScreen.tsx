import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { eventKeys, fetchEvent } from '@/features/event/api'
import { IN_PROGRESS_MS } from '@/features/home/api'
import { JuntaHeader } from '@/features/junta/JuntaHeader'
import { useUserId } from '@/features/session/useUserId'
import { errorKey } from '@/lib/errors'
import { Avatar } from '@/ui/Avatar/Avatar'

import { fetchInside, insideKeys } from './insideApi'

/**
 * Who is in the room.
 *
 * The president's rectangle, read the way that costs nothing: the box is the
 * venue and the bubbles are the people the scanner has let in. No floor plan
 * with zones — that needs everybody to place themselves and place themselves
 * again every half hour, and at two in the morning nobody does, so a stale
 * plan lies more than it informs.
 *
 * ONE CHANGE FROM THE DRAWING. The design says "the ones who checked in and
 * have not left yet". Nothing records leaving — there is no exit scan and the
 * exit photo is not one — so the sentence here says what is actually true: the
 * ones the scanner let in. The headline number is the same either way.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

const BUBBLE = 44
/** Room for the name under a face, plus air before the box. */
const LABEL = 22
const GAP = 8

const TOP = BUBBLE + LABEL + GAP
const BOX_H = 208
const BOTTOM = TOP + BOX_H + GAP
const RING_H = BOTTOM + BUBBLE + LABEL

/**
 * The ring around the box, clockwise from the top left.
 *
 * Anchored to whichever edge is nearer instead of the drawing's absolute x, so
 * the ring holds its shape from a 360px phone to a 430px one. The two rows are
 * clear of the box rather than sitting on its border: the drawing had no names
 * to fit under the faces and real ones need the room.
 */
const EDGE = 6
const RING = [
  { left: EDGE, top: 0 },
  { left: 84, top: 0 },
  { right: 84, top: 0 },
  { right: EDGE, top: 0 },
  { right: EDGE, top: TOP + 34 },
  { right: EDGE, top: TOP + 118 },
  { right: EDGE, top: BOTTOM },
  { right: 84, top: BOTTOM },
  { left: 84, top: BOTTOM },
  { left: EDGE, top: TOP + 118 },
] as const

export function InsideScreen() {
  const { t } = useTranslation()
  const { eventId } = useParams()
  const id = eventId ?? ''
  const meId = useUserId()
  // One reading of the clock per render, like the event detail.
  const [now] = useState(() => Date.now())

  const event = useQuery({
    queryKey: eventKeys.one(id),
    queryFn: () => fetchEvent(id),
    enabled: id !== '',
  })
  const inside = useQuery({
    queryKey: insideKeys.list(id),
    queryFn: () => fetchInside(id),
    enabled: id !== '',
    // The door is still going while somebody is looking at this.
    refetchInterval: 60_000,
  })

  // "Right now" has to stop being true when the party ends. Deep-linked from
  // a chat weeks later, the same screen says "that night" and the dot is off.
  const e = event.data
  const ends =
    e == null
      ? null
      : new Date(e.ends_at ?? new Date(e.starts_at).getTime() + IN_PROGRESS_MS).getTime()
  const live = ends === null || now < ends

  const rows = inside.data ?? []
  // Mine first, so somebody looking for themselves finds themselves, then the
  // most recent arrivals — which is the half of the room that is news.
  const ordered = [...rows].sort((a, b) => {
    if (a.user_id === meId) return -1
    if (b.user_id === meId) return 1
    return b.checked_in_at.localeCompare(a.checked_in_at)
  })
  // The last slot is the overflow count, unless everybody fits.
  const full = ordered.length > RING.length
  const shown = ordered.slice(0, full ? RING.length - 1 : RING.length)
  const rest = ordered.length - shown.length

  return (
    <main className="with-tabbar min-h-dvh bg-app">
      <JuntaHeader
        to={`/esdeveniment/${id}`}
        label={e?.titulo ?? t('actions.back')}
        title={t(live ? 'inside.link' : 'inside.linkPast')}
      />

      <div className={`pt-6 pb-4 ${GUTTER}`}>
        <p className="flex items-center gap-5">
          {live ? (
            <span
              aria-hidden="true"
              className="size-[10px] flex-none animate-pulse rounded-full bg-success"
            />
          ) : null}
          <span className={`eyebrow ${live ? 'text-success' : 'text-fg-muted'}`}>
            {t(live ? 'inside.now' : 'inside.was')}
          </span>
        </p>
        {/* Not a heading: the header above already carries the h1. And with
            nobody in yet the number is not the news — the emptiness is. */}
        <p className="display mt-6 text-d-md leading-[0.88] tracking-[-0.05em] [text-wrap:balance]">
          {rows.length === 0
            ? t('inside.nobody')
            : t(live ? 'inside.count' : 'inside.countPast', {
                count: rows.length,
                where: e?.ubicacion ?? '',
              })}
        </p>
        <p className="mt-5 text-base text-fg-secondary [text-wrap:pretty]">
          {t(live ? 'inside.lede' : 'inside.ledePast')}
        </p>
      </div>

      {inside.isPending ? (
        <p className={`pt-8 text-fg-muted ${GUTTER}`}>{t('state.loading')}</p>
      ) : inside.isError ? (
        <p
          role="alert"
          className={`pt-8 text-md font-bold text-error [text-wrap:pretty] ${GUTTER}`}
        >
          {t(errorKey(inside.error))}
        </p>
      ) : rows.length === 0 ? null : (
        <div className={GUTTER}>
          <div className="relative" style={{ height: RING_H }}>
            {/* The venue. A box with a number in it, not a map. */}
            <div
              aria-hidden="true"
              className="absolute right-[60px] left-[60px] flex flex-col items-center justify-center border-2 border-[var(--ds-car-line)] bg-[var(--ds-venue)]"
              style={{ top: TOP, height: BOX_H }}
            >
              <span className="display text-[58px] leading-[0.86] tracking-[-0.055em]">
                {rows.length}
              </span>
              {e?.ubicacion == null ? null : (
                <span className="eyebrow mt-5 max-w-full truncate px-4 text-xs-lo tracking-[0.18em] text-fg-muted">
                  {e.ubicacion}
                </span>
              )}
              {/* Only where there is a cap to be under. Without one, "of 24
                  signed up" next to 24 inside says nothing. */}
              {e?.plazas == null ? null : (
                <span className="mt-2 text-sm-lo text-[var(--ds-text-muted-lo)]">
                  {t('inside.ofExpected', { count: e.plazas })}
                </span>
              )}
            </div>

            {shown.map((r, index) => {
              const slot = RING[index]
              if (slot === undefined) return null
              return (
                <Bubble
                  key={r.user_id}
                  slot={slot}
                  name={r.user_id === meId ? t('rides.you') : r.nombre}
                  src={r.avatar_url}
                  ringed={r.user_id === meId}
                />
              )
            })}

            {/* The faces are a sample; the number in the middle is the truth. */}
            {rest > 0 ? (
              <div className="absolute" style={RING[RING.length - 1]}>
                <span
                  className="grid place-items-center rounded-full border-[1.5px] border-surface-8 text-sm font-bold text-fg-muted"
                  style={{ width: BUBBLE, height: BUBBLE }}
                >
                  {`+${String(rest)}`}
                </span>
              </div>
            ) : null}
          </div>

          <p className="pt-8 text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
            {t('inside.note')}
          </p>
        </div>
      )}
    </main>
  )
}

type Slot = { readonly top: number } & ({ readonly left: number } | { readonly right: number })

function Bubble({
  slot,
  name,
  src,
  ringed,
}: {
  readonly slot: Slot
  readonly name: string
  readonly src: string | null
  readonly ringed: boolean
}) {
  return (
    <div className="absolute" style={{ ...slot, width: BUBBLE }}>
      <span
        className={`block rounded-full ${ringed ? 'outline-2 outline-offset-2 outline-brand' : ''}`}
      >
        <Avatar src={src} size={BUBBLE} />
      </span>
      {/* Wider than the face and centred on it, but only by as much as the
          ring's own margin: any wider and a corner name leaves the screen. */}
      <span className="mt-2 -ml-[4px] block w-[52px] truncate text-center text-[11px] font-bold">
        {name}
      </span>
    </div>
  )
}
