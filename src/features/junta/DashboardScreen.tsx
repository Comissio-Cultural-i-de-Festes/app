import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type Bounds, periodBounds } from '@/features/ranking/api'
import { defaultPeriod, usePeriods } from '@/features/ranking/useRanking'
import { formatMonthShort } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import type { Escola } from '@/lib/model'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import {
  type Dashboard,
  dashboardKeys,
  type Drifting,
  fetchDashboard,
  whatsappHref,
} from './dashboardApi'
import { JuntaHeader } from './JuntaHeader'

/**
 * El tauler.
 *
 * L'ÚNIC DE LA FASE PENSAT PER A PANTALLA GRAN, i l'únic que no es mira des
 * d'una festa. Al mòbil es queda en una columna, com tota la zona junta.
 *
 * UNA SOLA PREGUNTA: qui s'està despenjant i què hi fem. Cada targeta acaba en
 * una fletxa amb l'acció, i un número que no en canvia cap no hi hauria de ser
 * — per això no hi ha ni un total de socis ni un compte d'activitats fetes.
 *
 * I EL ZERO TAMBÉ ES DIU. «Ningú despenjat ara mateix. Millor.» és informació;
 * una targeta que desapareix quan tot va bé fa que la junta no sàpiga mai si ho
 * ha mirat o si no hi havia res.
 */

const GUTTER = 'px-[var(--ds-gutter)] lg:px-14'
const CARD = 'border border-surface-5 bg-surface-1 px-10 py-10'
const ACTION = 'mt-6 text-sm font-bold text-brand-label [text-wrap:pretty]'

export function DashboardScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const periods = usePeriods()
  const [picked, setPicked] = useState<string | null>(null)

  // Els períodes ja porten el curs sencer com a primera fila: afegir-hi un xip
  // propi de «tot el curs» en donava dos que deien el mateix.
  const period = periods.data?.find((p) => p.codi === picked) ?? defaultPeriod(periods.data)
  const bounds: Bounds = periodBounds(period)

  const board = useQuery({
    queryKey: dashboardKeys.board(bounds),
    queryFn: () => fetchDashboard(bounds),
  })

  return (
    <main className="min-h-dvh bg-app pb-14">
      <JuntaHeader to="/junta" label={t('junta.back')} className="lg:hidden" />

      <div className={`pt-8 ${GUTTER}`}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="display text-d-s tracking-[-0.045em] lg:text-d-md">
              {t('junta.dashboard.title')}
            </h1>
            <p className="mt-4 text-md-lo text-fg-muted [text-wrap:pretty]">
              {t('junta.dashboard.lead')}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {(periods.data ?? []).map((p) => (
              <Chip
                key={p.codi}
                on={period?.codi === p.codi}
                onClick={() => {
                  setPicked(p.codi)
                }}
              >
                {periodLabel(p, t)}
              </Chip>
            ))}
          </div>
        </div>

        {board.isPending ? (
          <CardsSkeleton />
        ) : board.isError ? (
          <p role="alert" className="py-10 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(board.error))}
          </p>
        ) : (
          <Cards data={board.data} locale={locale} />
        )}
      </div>
    </main>
  )
}

function Cards({
  data,
  locale,
}: {
  readonly data: Dashboard
  readonly locale: ReturnType<typeof toLocale>
}) {
  const { t } = useTranslation()
  const maxAttendance = Math.max(1, ...data.assistencia.map((a) => a.quants))
  const maxType = Math.max(1, ...data.per_tipus.map((r) => r.mitjana))
  const totalPoints = Math.max(
    1,
    data.punts_per_motiu.reduce((n, r) => n + r.punts, 0),
  )

  return (
    <>
      {/* El número que justifica la fase. Va sol i a dalt de tot. */}
      <section className={`mt-9 ${CARD}`}>
        <div className="flex items-center gap-8">
          <p className="tabular display text-d-lg leading-[0.9] tracking-[-0.05em] text-warning">
            {String(data.despenjats.length)}
          </p>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">{t('junta.dashboard.drifting.title')}</h2>
            <p className="mt-[3px] text-sm text-fg-muted [text-wrap:pretty]">
              {t('junta.dashboard.drifting.lead')}
            </p>
          </div>
        </div>

        {data.despenjats.length === 0 ? (
          <p className="mt-8 text-md text-fg-muted [text-wrap:pretty]">
            {t('junta.dashboard.drifting.none')}
          </p>
        ) : (
          <>
            <ul className="mt-8">
              {data.despenjats.map((d) => (
                <Person key={d.id} who={d} locale={locale} />
              ))}
            </ul>
            <p className={ACTION}>{t('junta.dashboard.drifting.action')}</p>
          </>
        )}
      </section>

      <div className="mt-9 grid gap-9 lg:grid-cols-3">
        {/* Assistència: el que es llegeix és la forma de la corba. */}
        <section className={CARD}>
          <h2 className="eyebrow text-fg-muted">{t('junta.dashboard.attendance.title')}</h2>
          {/* `title` nomes parla amb el ratoli: al mobil —on aquest tauler
              tambe es mira— i a un lector de pantalla, les barres eren
              decoracio muda. Una llista amb nom per barra es recorrible. */}
          <ul className="mt-8 flex h-[120px] items-end gap-3">
            {data.assistencia.map((a) => (
              <li
                key={a.id}
                title={`${a.titulo}: ${String(a.quants)}`}
                aria-label={`${a.titulo}: ${String(a.quants)}`}
                className="flex-1 bg-surface-7"
                style={{ height: `${String(Math.round((a.quants / maxAttendance) * 100))}%` }}
              />
            ))}
          </ul>
          <div className="mt-3 flex justify-between text-2xs font-bold tracking-[0.08em] text-fg-dim uppercase">
            {months(data.assistencia, locale).map((m, i) => (
              <span key={`${m}${String(i)}`}>{m}</span>
            ))}
          </div>
          <p className="tabular mt-7 text-sm text-fg-secondary [text-wrap:pretty]">
            {t('junta.dashboard.attendance.avg', { n: average(data.assistencia) })}
          </p>
          <p className={ACTION}>{t('junta.dashboard.attendance.action')}</p>
        </section>

        {/* Quin tipus funciona. «Sempre plena» hi és perquè sense ella la
            mitjana diu el contrari del que passa: una casa rural de divuit
            places sempre plena no és menys popular que una festa de quaranta. */}
        <section className={CARD}>
          <h2 className="eyebrow text-fg-muted">{t('junta.dashboard.types.title')}</h2>
          <div className="mt-8 grid gap-7">
            {data.per_tipus.map((r) => (
              <div key={r.tipo}>
                <div className="flex justify-between text-md-lo font-bold">
                  <span>{t(`eventType.${r.tipo}`)}</span>
                  <span className="tabular">
                    {t('junta.dashboard.types.avg', { n: r.mitjana })}
                  </span>
                </div>
                <div className="mt-[5px] h-[8px] bg-surface-3">
                  <div
                    className="h-[8px] bg-surface-8"
                    style={{ width: `${String(Math.round((r.mitjana / maxType) * 100))}%` }}
                  />
                </div>
                {r.sempre_plena ? (
                  <p className="mt-[5px] text-xs text-fg-muted-lo [text-wrap:pretty]">
                    {t('junta.dashboard.types.alwaysFull')}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <p className={ACTION}>{t('junta.dashboard.types.action')}</p>
        </section>

        <section className={CARD}>
          <h2 className="eyebrow text-fg-muted">{t('junta.dashboard.schools.title')}</h2>
          <ul className="mt-6">
            {data.escoles.map((s) => (
              <li
                key={s.escola}
                className="flex items-center gap-6 border-b border-surface-4 py-5 last:border-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-bold">
                    {t(`escolaShort.${s.escola as Escola}`)}
                  </span>
                  <span
                    className={
                      'mt-[2px] block text-xs ' +
                      (s.actius * 2 < s.socis
                        ? 'text-[var(--ds-warning-deep)]'
                        : 'text-fg-muted-lo')
                    }
                  >
                    {t('junta.dashboard.schools.active', { n: s.actius, total: s.socis })}
                  </span>
                </span>
                <span className="tabular display flex-none text-d-xs tracking-[-0.035em]">
                  {String(s.punts)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-fg-muted-lo [text-wrap:pretty]">
            {t('junta.dashboard.schools.note')}
          </p>
        </section>
      </div>

      <div className="mt-9 grid items-start gap-9 lg:grid-cols-[2fr_1fr]">
        <section className={CARD}>
          <h2 className="eyebrow text-fg-muted">{t('junta.dashboard.points.title')}</h2>
          <div className="mt-8 grid gap-6">
            {data.punts_per_motiu.map((r) => {
              const pct = Math.round((r.punts / totalPoints) * 100)
              return (
                <div key={r.motivo} className="grid grid-cols-[110px_1fr_60px] items-center gap-6">
                  <span className="text-md-lo font-bold">{t(`motive.${r.motivo}`)}</span>
                  <div className="h-[10px] bg-surface-3">
                    <div className="h-[10px] bg-surface-9" style={{ width: `${String(pct)}%` }} />
                  </div>
                  <span className="tabular text-right text-sm font-bold text-fg-secondary">
                    {pct}%
                  </span>
                </div>
              )
            })}
          </div>
          <p className={ACTION}>{t('junta.dashboard.points.action')}</p>
        </section>

        {/* El que el tauler encara no pot dir, escrit a la pantalla i no en un
            comentari: la junta canvia cada any i algú preguntarà. */}
        <section className="border border-surface-5 px-10 py-10">
          <h2 className="eyebrow-sm text-brand-accent">{t('junta.dashboard.limits.title')}</h2>
          <ul className="mt-5 grid gap-4 text-sm text-fg-secondary">
            <li className="[text-wrap:pretty]">— {t('junta.dashboard.limits.years')}</li>
            <li className="[text-wrap:pretty]">— {t('junta.dashboard.limits.noTables')}</li>
            <li className="[text-wrap:pretty]">— {t('junta.dashboard.limits.write')}</li>
          </ul>
        </section>
      </div>
    </>
  )
}

function Person({
  who,
  locale,
}: {
  readonly who: Drifting
  readonly locale: ReturnType<typeof toLocale>
}) {
  const { t } = useTranslation()
  const href = whatsappHref(who.telefon)

  return (
    <li className="flex flex-col gap-4 border-t border-surface-4 py-6 lg:flex-row lg:items-center lg:gap-7">
      <Avatar src={null} size={34} />
      <span className="lg:w-[200px] lg:flex-none">
        <span className="block text-[14.5px] font-bold">{who.nom}</span>
        <span className="mt-[2px] block text-xs text-fg-dim">
          {[
            who.escola === null ? null : t(`escolaShort.${who.escola as Escola}`),
            who.curs === null ? null : t(`onboarding.year.${String(who.curs)}`),
          ]
            .filter((x): x is string => x !== null)
            .join(' · ')}
        </span>
      </span>
      <span className="min-w-0 flex-1 text-sm text-fg-secondary [text-wrap:pretty]">
        {t('junta.dashboard.drifting.was', { n: who.hi_va_anar, total: who.comptaven })}
      </span>
      <span className="text-sm text-fg-muted-lo lg:w-[220px] lg:flex-none [text-wrap:pretty]">
        {who.ultima === null || who.ultima_at === null
          ? t('junta.dashboard.drifting.never')
          : t('junta.dashboard.drifting.last', {
              event: who.ultima,
              when: formatMonthShort(new Date(who.ultima_at), locale),
            })}
      </span>
      {href === null ? (
        <span className="text-sm text-fg-muted-lo lg:flex-none">
          {t('junta.dashboard.drifting.noPhone')}
        </span>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-[40px] items-center justify-center border-[1.5px] border-surface-7 px-8 text-sm font-bold text-fg-secondary no-underline lg:flex-none"
        >
          {t('junta.dashboard.drifting.write')}
        </a>
      )}
    </li>
  )
}

function Chip({
  on,
  onClick,
  children,
}: {
  readonly on: boolean
  readonly onClick: () => void
  readonly children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={
        'flex min-h-[40px] items-center rounded-round px-8 text-sm-lo ' +
        (on
          ? 'bg-brand-cta font-bold text-on-brand'
          : 'border border-border-strong font-semibold text-fg-secondary')
      }
    >
      {children}
    </button>
  )
}

/**
 * Com es diu un període.
 *
 * Mateixa cadena de recanvi que el rànquing, i pel mateix motiu: `etiqueta` és
 * opcional —la junta la posa a `/junta/periodes` i sovint no ho fa— i un xip
 * buit és un botó que ningú sap què fa.
 */
function periodLabel(
  period: { readonly codi: string; readonly etiqueta: string | null },
  t: ReturnType<typeof useTranslation>['t'],
): string {
  return t(`ranking.period.${period.codi}`, { defaultValue: period.etiqueta ?? period.codi })
}

/** Un rètol de mes per cada canvi de mes, i no un per barra. */
function months(
  points: readonly { readonly starts_at: string }[],
  locale: ReturnType<typeof toLocale>,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of points) {
    const label = formatMonthShort(new Date(p.starts_at), locale)
    if (!seen.has(label)) {
      seen.add(label)
      out.push(label)
    }
  }
  return out
}

function average(points: readonly { readonly quants: number }[]): number {
  if (points.length === 0) return 0
  return Math.round(points.reduce((n, p) => n + p.quants, 0) / points.length)
}

/**
 * El tauler no és una llista: és una targeta ampla i després dues graelles.
 *
 * Per això la silueta no repeteix una fila. Repetir-ne una hauria promès una
 * llista i hauria hagut de desfer-la sencera en arribar les dades.
 */
function CardsSkeleton() {
  return (
    <Skeleton>
      <div className={`mt-9 ${CARD}`}>
        <div className="flex items-center gap-8">
          <SkeletonBar w="w-[62px]" h="h-[44px]" className="flex-none" />
          <div className="min-w-0 flex-1">
            <SkeletonBar w="w-[55%]" h="h-[18px]" />
            <SkeletonBar w="w-[80%]" h="h-[12px]" className="mt-[3px]" />
          </div>
        </div>
      </div>

      <div className="mt-9 grid gap-9 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={CARD}>
            <SkeletonBar w="w-[45%]" h="h-[10px]" />
            <SkeletonBar w="w-full" h="h-[120px]" className="mt-8" />
          </div>
        ))}
      </div>

      <div className="mt-9 grid items-start gap-9 lg:grid-cols-[2fr_1fr]">
        <div className={CARD}>
          <SkeletonBar w="w-[38%]" h="h-[10px]" />
          <div className="mt-8 grid gap-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="grid grid-cols-[110px_1fr_60px] items-center gap-6">
                <SkeletonBar w="w-full" h="h-[12px]" />
                <SkeletonBar w="w-full" h="h-[12px]" />
                <SkeletonBar w="w-full" h="h-[12px]" />
              </div>
            ))}
          </div>
        </div>
        <div className="border border-surface-5 px-10 py-10">
          <SkeletonBar w="w-[52%]" h="h-[10px]" />
          <div className="mt-5 grid gap-4">
            {[0, 1, 2].map((i) => (
              <SkeletonBar key={i} w="w-full" h="h-[12px]" />
            ))}
          </div>
        </div>
      </div>
    </Skeleton>
  )
}
