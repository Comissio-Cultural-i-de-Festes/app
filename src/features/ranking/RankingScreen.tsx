import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useUserId } from '@/features/session/useUserId'
import { formatOrdinal } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import type { Escola } from '@/lib/model'
import { Avatar } from '@/ui/Avatar/Avatar'

import type { Period, RankingRow, SchoolRow } from './api'
import { defaultPeriod, useBoard, usePeriods } from './useRanking'

/**
 * The leaderboard.
 *
 * Schools first and individuals second, deliberately: the association is
 * ninety per cent people who will never be in the top ten, and a screen that
 * opens on a list they are nowhere near is a screen they close. Above their
 * school they are one of ninety-four, and the sentence under the heading says
 * so.
 */

const GUTTER = 'px-[var(--ds-gutter)]'
const LIST_LIMIT = 100

export function RankingScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const userId = useUserId()

  const periods = usePeriods()
  const [chosen, setChosen] = useState<string | null>(null)
  const fallback = defaultPeriod(periods.data)
  const period = periods.data?.find((p) => p.codi === chosen) ?? fallback

  const board = useBoard(period)
  const me = board.rows.find((r) => r.user_id === userId) ?? null

  return (
    <div className="with-tabbar min-h-dvh bg-app">
      <div className="sticky top-0 z-20 border-b border-surface-5 bg-app pt-[var(--ds-safe-top)]">
        <div className={`flex items-end justify-between gap-6 pt-[2px] pb-6 ${GUTTER}`}>
          <h1 className="display text-d-s tracking-[-0.045em]">{t('nav.ranking')}</h1>
          {periods.data && periods.data.length > 1 ? (
            <div
              className="flex min-w-0 gap-[6px] overflow-x-auto pb-2 [scrollbar-width:none]"
              role="group"
              aria-label={t('ranking.periodLabel')}
            >
              {periods.data.map((p) => (
                <PeriodChip
                  key={p.codi}
                  period={p}
                  active={p.codi === period?.codi}
                  onSelect={() => {
                    setChosen(p.codi)
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>

        {me ? (
          <div className="flex items-center gap-6 border-t border-brand-banner-border bg-brand-banner px-[var(--ds-gutter)] py-[11px]">
            <Avatar src={me.avatar_url} size={34} />
            <div className="flex-1">
              <p className="text-[14.5px] font-bold">
                {t('ranking.you', {
                  position: formatOrdinal(me.posicio, locale),
                  total: board.rows.length,
                })}
              </p>
              <p className="text-[12.5px] text-brand-banner-fg">{t('ranking.youSub')}</p>
            </div>
            <p className="tabular display flex-none text-[24px] tracking-[-0.04em]">{me.punts}</p>
          </div>
        ) : null}
      </div>

      {board.isError ? (
        <div role="alert" className={`flex items-center justify-between gap-3 py-4 ${GUTTER}`}>
          <p className="text-sm text-error [text-wrap:pretty]">{t(errorKey(board.error))}</p>
          <button
            type="button"
            onClick={board.refetch}
            className="-mr-3 min-h-[44px] flex-none px-3 text-sm font-bold text-brand-label"
          >
            {t('actions.retry')}
          </button>
        </div>
      ) : board.isPending ? (
        <p className={`${GUTTER} py-16 text-center text-fg-muted`}>{t('state.loading')}</p>
      ) : board.rows.length === 0 && board.schools.length === 0 ? (
        <p className={`${GUTTER} py-16 text-center text-md text-fg-muted [text-wrap:pretty]`}>
          {t('ranking.nothingYet')}
        </p>
      ) : (
        <>
          <section>
            <div className={`pt-[18px] pb-[6px] ${GUTTER}`}>
              <h2 className="eyebrow text-brand-accent">{t('ranking.schools')}</h2>
              <p className="mt-[5px] text-sm text-fg-muted [text-wrap:pretty]">
                {t('ranking.schoolsLede')}
              </p>
            </div>
            <ul>
              {board.schools.map((school) => (
                <SchoolLine
                  key={school.escola}
                  school={school}
                  mine={school.escola === me?.escola}
                  weekly={board.weekly.get(school.escola) ?? null}
                />
              ))}
            </ul>
          </section>

          <section>
            <div
              className={`mt-[22px] flex items-baseline justify-between border-b border-surface-5 pb-4 ${GUTTER}`}
            >
              <h2 className="eyebrow text-brand-accent">{t('ranking.individual')}</h2>
              <p className="text-xs font-semibold text-fg-dim">
                {t('ranking.listed', { count: board.rows.length })}
              </p>
            </div>
            <ul>
              {board.rows.slice(0, LIST_LIMIT).map((row) => (
                <MemberLine
                  key={row.user_id}
                  row={row}
                  mine={row.user_id === userId}
                  delta={board.deltas.get(row.user_id) ?? null}
                />
              ))}
            </ul>
            {/* Only when the list really was cut short. An association of
                twenty has no tail to joke about, and telling them the list
                stops here when it plainly does not is just noise. */}
            {board.rows.length > LIST_LIMIT ? (
              <p
                className={`pt-[18px] pb-6 text-sm text-[var(--ds-text-muted-lo)] [text-wrap:pretty] ${GUTTER}`}
              >
                {t('ranking.cutOff')}
              </p>
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}

// ── the period chips ────────────────────────────────────────────────────────

function PeriodChip({
  period,
  active,
  onSelect,
}: {
  readonly period: Period
  readonly active: boolean
  readonly onSelect: () => void
}) {
  const { t } = useTranslation()

  // Periods the junta invents have no translation, so they carry their own
  // label. Better than showing somebody the string "t4".
  const label = t(`ranking.period.${period.codi}`, { defaultValue: period.etiqueta ?? period.codi })

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={
        'flex min-h-[44px] items-center rounded-[22px] px-6 text-[12.5px] whitespace-nowrap ' +
        (active
          ? 'bg-brand-cta font-bold text-on-brand'
          : 'border border-border-strong font-semibold text-fg-secondary')
      }
    >
      {label}
    </button>
  )
}

// ── a school ────────────────────────────────────────────────────────────────

function SchoolLine({
  school,
  mine,
  weekly,
}: {
  readonly school: SchoolRow
  readonly mine: boolean
  readonly weekly: number | null
}) {
  const { t } = useTranslation()

  return (
    <li
      className={
        'flex items-center gap-[13px] border-b border-surface-4 px-[var(--ds-gutter)] py-[14px] ' +
        (mine ? 'selected--soft' : '')
      }
    >
      <p
        className={
          'tabular display w-[26px] flex-none text-[26px] tracking-[-0.05em] ' +
          (school.posicio === 1 ? 'text-brand-accent' : 'text-fg-faint')
        }
      >
        {school.posicio}
      </p>

      <div className="flex-1">
        <div className="flex items-center gap-[7px]">
          <span className="text-lg font-bold tracking-[-0.01em]">
            {t(`escola.${school.escola satisfies Escola}`)}
          </span>
          {mine ? (
            <span className="rounded-xs bg-brand-cta px-[7px] py-[3px] text-[10.5px] font-extrabold tracking-[0.1em] whitespace-nowrap text-on-brand uppercase">
              {t('ranking.yours')}
            </span>
          ) : null}
        </div>
        <p className="mt-[3px] text-[12.5px] text-[var(--ds-text-muted-lo)]">
          {t('ranking.schoolFoot', {
            members: school.membres,
            count: school.esdeveniments,
          })}
        </p>
      </div>

      <div className="flex-none text-right">
        <p className="tabular display text-[21px] tracking-[-0.035em]">{school.punts_totals}</p>
        {weekly !== null && weekly > 0 ? (
          <p className="mt-[2px] text-[11.5px] font-bold text-success">
            {t('ranking.thisWeek', { count: weekly })}
          </p>
        ) : null}
      </div>
    </li>
  )
}

// ── a member ────────────────────────────────────────────────────────────────

function MemberLine({
  row,
  mine,
  delta,
}: {
  readonly row: RankingRow
  readonly mine: boolean
  readonly delta: number | null
}) {
  const { t } = useTranslation()
  const top = row.posicio <= 3

  return (
    <li
      className={
        'flex items-center gap-[11px] border-b border-surface-3 px-[var(--ds-gutter)] ' +
        (top ? 'py-[13px] ' : 'py-[10px] ') +
        (mine ? 'selected' : '')
      }
    >
      <p
        className={
          'tabular w-[30px] flex-none text-right tracking-[-0.02em] ' +
          (top
            ? 'display text-2xl text-brand-accent'
            : `text-md font-bold ${mine ? 'text-fg-selected' : 'text-fg-faint'}`)
        }
      >
        {row.posicio}.
      </p>

      <Avatar src={row.avatar_url} size={top ? 40 : 32} ring={mine} />

      <div className="min-w-0 flex-1">
        <p
          className={
            'truncate tracking-[-0.01em] ' +
            (top
              ? 'text-[16.5px] font-bold'
              : mine
                ? 'text-base font-bold'
                : 'text-base font-medium')
          }
        >
          {mine ? t('ranking.mine', { name: row.nombre }) : row.nombre}
        </p>
        {row.escola === null ? null : (
          <p className="mt-[2px] text-[11.5px] font-semibold tracking-[0.05em] text-fg-dim uppercase">
            {t(`escolaShort.${row.escola satisfies Escola}`)}
          </p>
        )}
      </div>

      <Movement delta={delta} />

      <p
        className={
          'tabular w-[52px] flex-none text-right tracking-[-0.03em] ' +
          (top || mine ? 'display text-2xl' : 'text-lg font-bold text-fg-secondary')
        }
      >
        {row.punts}
      </p>
    </li>
  )
}

/**
 * How many places somebody moved this week.
 *
 * The arrow is the signal and the colour reinforces it, the same way the
 * scanner works: green up, quiet grey level, quieter still down. Nothing at
 * all when the selected period has already ended, because "this week" has no
 * meaning inside a term that finished in December.
 */
function Movement({ delta }: { readonly delta: number | null }) {
  const { t } = useTranslation()
  if (delta === null) return <span className="w-[30px] flex-none" />

  const label =
    delta > 0
      ? t('ranking.movement.up', { count: delta })
      : delta < 0
        ? t('ranking.movement.down', { count: -delta })
        : t('ranking.movement.same')

  return (
    <span
      title={label}
      aria-label={label}
      className={
        'tabular w-[30px] flex-none text-center text-[11.5px] font-bold ' +
        (delta > 0 ? 'text-success' : delta < 0 ? 'text-fg-muted' : 'text-fg-faint')
      }
    >
      <span aria-hidden="true">
        {delta === 0 ? '=' : `${delta > 0 ? '▲' : '▼'}${String(Math.abs(delta))}`}
      </span>
    </span>
  )
}
