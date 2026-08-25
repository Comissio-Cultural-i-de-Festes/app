import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { formatMonthLong } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Sheet, SheetClose } from '@/ui/Sheet/Sheet'

import { type BadgeRow, badgeKeys, fetchHolders } from './api'
import type { BadgeCard } from './catalogue'

/**
 * Una insígnia, de prop.
 *
 * Dues coses que la graella no pot dir. La primera són els nivells: qui en
 * porta disset ha de veure que el cinc va caure a l'octubre, el deu al desembre
 * i que el vint-i-cinc encara és a vuit de distància — tres dates que a la
 * targeta petita no hi caben.
 *
 * La segona és quanta gent la té, i és la que fa que una insígnia sigui una
 * cosa compartida i no un adhesiu privat. Surt d'una funció i no de la taula:
 * `badges` només és llegible per un mateix, igual que `points_log`, i el
 * recompte viatja com viatja el rànquing.
 */

export function BadgeSheet({
  card,
  rows,
  attended,
  onClose,
}: {
  readonly card: BadgeCard
  /** Les files que aquesta persona té d'aquesta targeta. */
  readonly rows: readonly BadgeRow[]
  /** A quantes activitats ha anat, per al «en portes 17». */
  readonly attended: number
  readonly onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)

  const holders = useQuery({ queryKey: badgeKeys.holders(), queryFn: fetchHolders })

  const earned = rows.length > 0
  const first = rows[0] ?? null
  const mine = holders.data?.find((h) => h.codi === card.codes[0]) ?? null

  return (
    <Sheet label={t(`badges.${card.key}.title`)} onClose={onClose}>
      <div className="flex items-start justify-between gap-5">
        <span
          className={
            'grid size-[76px] place-items-center ' +
            (earned
              ? 'border border-brand-banner-border bg-brand-tint-soft text-brand-accent'
              : 'border border-surface-3 text-fg-faint-lo')
          }
        >
          <card.Mark size={42} />
        </span>
        <SheetClose onClose={onClose} />
      </div>

      <h2 className="display mt-7 text-d-sm tracking-[-0.045em] [text-wrap:balance]">
        {t(`badges.${card.key}.title`)}
      </h2>
      <p className="mt-4 text-[13.5px] text-fg-secondary [text-wrap:pretty]">
        {t(`badges.${card.key}.about`)}
      </p>

      {card.levels === undefined ? (
        !earned ? null : (
          <p className="mt-8 text-sm font-semibold text-fg-dim [text-wrap:pretty]">
            {first?.starts_at != null && first.titol !== null
              ? t('badges.earnedAt', {
                  event: first.titol,
                  month: formatMonthLong(new Date(first.starts_at), locale),
                })
              : t(`badges.${card.key}.done`)}
          </p>
        )
      ) : (
        // Els tres nivells d'una sola insígnia. El pendent porta el número que
        // hi ha ara, que és l'única part que empeny — i empeny dient on ets, no
        // el que et falta.
        <div className="mt-8 flex gap-3">
          {card.levels.map((level, i) => {
            const code = card.codes[i]
            const row = rows.find((r) => r.codi === code) ?? null
            return (
              <div
                key={level}
                className={
                  'flex-1 px-6 py-5 ' +
                  (row === null
                    ? 'border border-surface-5'
                    : 'border-l-[3px] border-brand bg-brand-tint-soft')
                }
              >
                <p
                  className={'display tabular text-[19px] ' + (row === null ? 'text-fg-faint' : '')}
                >
                  {String(level)}
                </p>
                <p className="tabular mt-1 text-2xs font-bold text-fg-dim">
                  {row?.starts_at != null
                    ? formatMonthLong(new Date(row.starts_at), locale)
                    : t('badges.soFar', { n: attended })}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {mine === null ? null : (
        <div className="mt-10 flex items-center gap-4">
          {(mine.cares ?? []).length === 0 ? null : (
            <span className="flex">
              {(mine.cares ?? []).map((src, i) => (
                <span
                  key={src}
                  className={
                    'box-content rounded-full border-2 border-surface-2 ' +
                    (i === 0 ? '' : '-ml-[9px]')
                  }
                >
                  <Avatar src={src} size={28} />
                </span>
              ))}
            </span>
          )}
          <p className="text-sm font-semibold text-fg-secondary">
            {t('badges.holders', { n: mine.quants, total: mine.total })}
          </p>
        </div>
      )}

      <p className="mt-6 text-[12.5px] text-fg-muted-lo [text-wrap:pretty]">{t('badges.footer')}</p>
    </Sheet>
  )
}
