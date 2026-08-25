import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { eventKeys, fetchEvent } from '@/features/event/api'
import { fetchPointValues } from '@/features/junta/eventFormApi'
import { Avatar } from '@/ui/Avatar/Avatar'

import { errorKey } from '@/lib/errors'

import { awardPoints, doorKeys, fetchRoster } from './api'

/**
 * Giving points to the people who did the work.
 *
 * Two taps, as the brief asks: mark the four who carried the speakers, then
 * tap the reason. The amounts come from `point_values` rather than from here,
 * so the scale can be re-tuned in June without a deploy.
 *
 * The list is who actually turned up — not who said yes — because this is used
 * while stacking chairs at the end, and the people who helped are by
 * definition the ones who were there.
 */

const MOTIVES = ['montaje', 'conduir', 'trajo_gente', 'propuso'] as const

export function PointsScreen() {
  const { t } = useTranslation()
  const { eventId } = useParams()
  const id = eventId ?? ''
  const client = useQueryClient()

  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [given, setGiven] = useState<{ people: number; points: number } | null>(null)

  const event = useQuery({
    queryKey: eventKeys.one(id),
    queryFn: () => fetchEvent(id),
    enabled: id !== '',
  })
  const roster = useQuery({
    queryKey: doorKeys.roster(id),
    queryFn: () => fetchRoster(id),
    enabled: id !== '',
  })
  const values = useQuery({ queryKey: doorKeys.pointValues(), queryFn: fetchPointValues })

  const here = (roster.data ?? []).filter((r) => r.checked_in)

  const award = useMutation({
    mutationFn: ({ motivo, punts }: { motivo: string; punts: number }) =>
      awardPoints([...picked], id, motivo, punts),
    onSuccess: async (_data, variables) => {
      setGiven({ people: picked.size, points: variables.punts })
      setPicked(new Set())
      await client.invalidateQueries({ queryKey: ['ranking'] })
    },
  })

  function toggle(userId: string) {
    setPicked((previous) => {
      const next = new Set(previous)
      if (!next.delete(userId)) next.add(userId)
      return next
    })
  }

  function pointsFor(clau: string): number | null {
    return values.data?.find((v) => v.mena === 'motiu' && v.clau === clau)?.punts ?? null
  }

  return (
    <main className="flex min-h-dvh flex-col bg-app">
      <header className="sticky top-0 z-20 border-b border-surface-5 bg-app px-[var(--ds-gutter)] pt-[calc(var(--ds-safe-top)+8px)] pb-7">
        <div className="flex items-center justify-between gap-6">
          <Link
            to="/junta"
            className="-ml-4 flex min-h-[56px] min-w-0 items-center gap-1 px-4 eyebrow text-brand-accent no-underline"
          >
            <span aria-hidden="true">‹</span>
            <span className="truncate">{event.data?.titulo ?? t('junta.title')}</span>
          </Link>
          {picked.size === 0 ? null : (
            <button
              type="button"
              onClick={() => {
                setPicked(new Set())
              }}
              className="-mr-4 min-h-[56px] flex-none px-4 text-sm font-bold text-fg-muted"
            >
              {t('door.clear')}
            </button>
          )}
        </div>
        <h1 className="display mt-4 text-d-s tracking-[-0.045em]">{t('door.pointsTitle')}</h1>
        <p className="mt-3 text-sm text-fg-muted [text-wrap:pretty]">{t('door.pointsLede')}</p>
      </header>

      <div className="flex items-center justify-between gap-6 border-b border-surface-5 px-[var(--ds-gutter)] py-5">
        <p className="eyebrow text-fg-muted">{t('door.whoIsHere', { count: here.length })}</p>
      </div>

      {roster.isPending ? (
        <p className="px-[var(--ds-gutter)] pt-10 text-fg-muted">{t('state.loading')}</p>
      ) : roster.isError ? (
        <p
          role="alert"
          className="px-[var(--ds-gutter)] pt-10 text-md font-bold text-error [text-wrap:pretty]"
        >
          {t(errorKey(roster.error))}
        </p>
      ) : (roster.data?.length ?? 0) === 0 ? (
        // Same trap as the manual list: zero rows is what a refusal looks like.
        <p
          role="alert"
          className="px-[var(--ds-gutter)] pt-10 text-md font-bold text-error [text-wrap:pretty]"
        >
          {t('door.rosterRefused')}
        </p>
      ) : here.length === 0 ? (
        <p className="px-[var(--ds-gutter)] pt-10 text-md text-fg-muted [text-wrap:pretty]">
          {t('door.nobodyHere')}
        </p>
      ) : (
        <ul>
          {here.map((row) => {
            const on = picked.has(row.user_id)
            return (
              <li key={row.user_id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    toggle(row.user_id)
                  }}
                  className={
                    'flex min-h-[56px] w-full items-center gap-4 border-b border-surface-4 ' +
                    'px-[var(--ds-gutter)] py-5 text-left ' +
                    (on ? 'bg-surface-3' : '')
                  }
                >
                  <span
                    aria-hidden="true"
                    className={
                      'flex size-[26px] flex-none items-center justify-center rounded-full text-sm font-extrabold ' +
                      (on
                        ? 'bg-brand-cta text-on-brand'
                        : 'border-[1.5px] border-[var(--ds-border-input)] text-transparent')
                    }
                  >
                    ✓
                  </span>
                  <Avatar src={null} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{row.nombre}</span>
                    <span className="mt-[2px] block text-[11.5px] font-semibold tracking-[0.05em] text-[var(--ds-text-muted-lo)] uppercase">
                      {row.escola === null ? '' : t(`escolaShort.${row.escola}`)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="px-[var(--ds-gutter)] py-8 text-sm text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {t('door.pointsUndo')}
      </p>

      {/* Sits above the list rather than at the end of it: with twenty-six
          people checked in, a bar at the bottom of the document is a scroll
          away from the person you just ticked. */}
      <div className="sticky bottom-0 z-10 mt-auto border-t border-surface-6 bg-[var(--ds-scrim-bar)] px-8 pt-7 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] backdrop-blur-[14px]">
        <div className="flex items-baseline justify-between gap-6">
          <p className="text-lg font-bold">
            {given !== null && picked.size === 0
              ? t('door.gave', { count: given.people, points: given.points })
              : t('door.chosen', { count: picked.size })}
          </p>
          <p className="text-sm text-fg-muted">{t('door.tapReason')}</p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-[9px]">
          {MOTIVES.map((clau, index) => {
            const punts = pointsFor(clau)
            const strong = index < 2
            return (
              <button
                key={clau}
                type="button"
                disabled={picked.size === 0 || punts === null || award.isPending}
                onClick={() => {
                  if (punts !== null) award.mutate({ motivo: clau, punts })
                }}
                className={
                  'flex min-h-[56px] flex-col items-center justify-center gap-1 px-4 py-5 ' +
                  '[text-wrap:balance] disabled:opacity-45 ' +
                  (strong
                    ? 'bg-brand-cta text-on-brand'
                    : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg')
                }
              >
                <span className="display text-d-xs tracking-[-0.04em]">
                  {punts === null ? '·' : `+${String(punts)}`}
                </span>
                <span className="text-sm font-bold">{t(`motive.${clau}`)}</span>
              </button>
            )
          })}
        </div>

        {values.isError ? (
          <p role="alert" className="mt-4 text-md font-bold text-error [text-wrap:pretty]">
            {t('door.pointsUnavailable')}
          </p>
        ) : null}

        {award.isError ? (
          <p role="alert" className="mt-4 text-md font-bold text-error">
            {t(errorKey(award.error))}
          </p>
        ) : null}
      </div>
    </main>
  )
}
