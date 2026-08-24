import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { JuntaHeader } from '@/features/junta/JuntaHeader'
import { fetchAttendedCount, profileScreenKeys } from '@/features/profile/api'
import { useUserId } from '@/features/session/useUserId'
import { formatMonthLong } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'

import { type BadgeRow, badgeKeys, fetchMyBadges, markBadgesSeen } from './api'
import { type BadgeCard, CATALOGUE, isEarned, TOTAL_CARDS } from './catalogue'
import { BadgeSheet } from './BadgeSheet'

/**
 * Les deu, totes a la vista.
 *
 * ES VEUEN LES QUE FALTEN, i porten la condició escrita en comptes d'un
 * cadenat. La graella sencera és el mapa del que es pot fer aquí, i al gener
 * molta gent l'obrirà sense tenir-ne cap: aquella pantalla ha de dir que és el
 * punt de partida de tothom, no que vas tard.
 *
 * Cap compta enrere i cap caduca. Una insígnia guanyada no es retira mai, ni
 * quan les condicions deixen de complir-se — això ho garanteix la base — i aquí
 * no hi ha res que ho pugui desdir.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function BadgesScreen() {
  const { t } = useTranslation()
  const userId = useUserId()
  const [open, setOpen] = useState<BadgeCard | null>(null)

  const badges = useQuery({ queryKey: badgeKeys.mine(userId), queryFn: fetchMyBadges })
  const attended = useQuery({
    queryKey: profileScreenKeys.attended(userId),
    queryFn: () => fetchAttendedCount(userId),
  })

  // Es tanquen quan la graella s'ha pintat de debò i no dins de la consulta:
  // una pantalla que es queda a mig carregar es menjaria la celebració per
  // sempre. No cal esperar la resposta ni refrescar res — el que canvia és
  // `seen_at`, i aquesta pantalla ja no el mira.
  const unseen = (badges.data ?? []).some((b) => b.nova)
  useEffect(() => {
    if (unseen) void markBadgesSeen()
  }, [unseen])

  const rows = badges.data ?? []
  const earned = new Set(rows.map((r) => r.codi))
  const quantes = CATALOGUE.filter((c) => isEarned(c, earned)).length

  return (
    <main className="with-tabbar min-h-dvh bg-app">
      <JuntaHeader to="/perfil" label={t('nav.profile')} />

      <div className={`pt-2 pb-8 ${GUTTER}`}>
        <div className="flex items-baseline justify-between gap-5">
          <h1 className="display text-d-s tracking-[-0.045em]">{t('badges.title')}</h1>
          <span className="tabular text-[12.5px] font-bold text-fg-muted-lo">
            {t('badges.count', { n: quantes, total: TOTAL_CARDS })}
          </span>
        </div>

        <p className="mt-5 text-sm text-fg-muted [text-wrap:pretty]">
          {quantes === 0 ? t('badges.leadEmpty') : t('badges.lead')}
        </p>

        {badges.isPending ? (
          <p className="py-8 text-fg-muted">{t('state.loading')}</p>
        ) : badges.isError ? (
          <p role="alert" className="py-8 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(badges.error))}
          </p>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-2 gap-5">
              {CATALOGUE.map((card) => (
                <Card
                  key={card.key}
                  card={card}
                  rows={rows.filter((r) => card.codes.some((c) => c === r.codi))}
                  attended={attended.data ?? 0}
                  onOpen={() => {
                    setOpen(card)
                  }}
                />
              ))}
            </div>
            <p className="mt-8 text-[12.5px] text-fg-muted-lo [text-wrap:pretty]">
              {t('badges.footerGrid')}
            </p>
          </>
        )}
      </div>

      {open === null ? null : (
        <BadgeSheet
          card={open}
          rows={rows.filter((r) => open.codes.some((c) => c === r.codi))}
          attended={attended.data ?? 0}
          onClose={() => {
            setOpen(null)
          }}
        />
      )}
    </main>
  )
}

function Card({
  card,
  rows,
  attended,
  onOpen,
}: {
  readonly card: BadgeCard
  readonly rows: readonly BadgeRow[]
  readonly attended: number
  readonly onOpen: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const has = rows.length > 0

  return (
    <button
      type="button"
      onClick={onOpen}
      className={
        'px-7 pt-8 pb-7 text-left ' +
        (has
          ? 'border border-brand-banner-border bg-brand-tint-soft'
          : 'border border-surface-3')
      }
    >
      <span className={'block ' + (has ? 'text-brand-accent' : 'text-fg-faint-lo')}>
        <card.Mark size={34} />
      </span>
      <p className={'mt-5 text-md font-bold [text-wrap:pretty] ' + (has ? '' : 'text-fg-muted')}>
        {t(`badges.${card.key}.title`)}
      </p>
      <p className="tabular mt-[3px] text-xs text-fg-dim [text-wrap:pretty]">
        {subtitle(card, rows, attended, locale, t)}
      </p>
    </button>
  )
}

/**
 * La línia de sota, que diu una cosa diferent en cada dels quatre casos.
 *
 * Guanyada: on va ser. Guanyada sense activitat concreta (`de_tot`, o una idea
 * que encara no té data): què vol dir. Amb nivells: quins han caigut i on ets.
 * Pendent: com es guanya — que és l'única versió que li serveix d'alguna cosa a
 * qui no la té.
 */
function subtitle(
  card: BadgeCard,
  rows: readonly BadgeRow[],
  attended: number,
  locale: ReturnType<typeof toLocale>,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (card.levels !== undefined) {
    const done = card.codes.filter((c) => rows.some((r) => r.codi === c)).length
    if (done === 0) return t('badges.progress', { n: attended, target: card.levels[0] })
    return card.levels
      .map((level, i) => (i < done ? `${String(level)} ✓` : `${String(level)}`))
      .join(' · ')
      .concat(` — ${t('badges.soFar', { n: attended })}`)
  }

  const row = rows[0]
  // Pendent: com es guanya. Guanyada: on va ser — i quan no hi ha cap
  // activitat concreta (`de_tot`, o una idea acceptada que encara no en té),
  // què vol dir. Ensenyar-hi la condició faria que una insígnia vermella
  // semblés pendent.
  if (row === undefined) return t(`badges.${card.key}.hint`)
  if (row.starts_at === null || row.titol === null) return t(`badges.${card.key}.done`)
  return `${row.titol} · ${formatMonthLong(new Date(row.starts_at), locale)}`
}
