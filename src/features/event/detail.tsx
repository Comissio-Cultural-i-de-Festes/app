import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * The parts of the event detail that only draw.
 *
 * They live apart from the screen because the junta's preview shows the same
 * thing from unsaved form values, and the alternative — reusing the screen —
 * is impossible: it takes no props at all and hangs off four queries and the
 * route parameter.
 *
 * Nothing in here fetches, and nothing in here knows where it is mounted.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function Cover({
  coverUrl,
  isPast,
  corner,
}: {
  readonly coverUrl: string | null
  readonly isPast: boolean
  /**
   * Top-left affordance. The screen puts a back link here and the junta's
   * preview puts a close button — hardcoding either one is what kept this
   * component welded to the route it was written for.
   */
  readonly corner: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <section className="relative h-[240px] bg-[oklch(0.2_0.02_25)]">
      {coverUrl === null ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[var(--ds-bg-avatar)] bg-[image:var(--ds-pattern-avatar)]"
        />
      ) : (
        <img
          src={coverUrl}
          alt=""
          className="absolute inset-0 size-full object-cover"
          decoding="async"
        />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,oklch(0.15_0.012_25/0.55)_0%,oklch(0.15_0.012_25/0.1)_40%,oklch(0.15_0.012_25/0.8)_82%,oklch(0.15_0.012_25)_100%)]"
      />

      <div className="absolute top-4 left-4">{corner}</div>

      {isPast ? (
        <p className="absolute top-6 right-4 rounded-xs bg-[var(--ds-badge-past-bg)] px-4 py-2 text-2xs font-extrabold tracking-[0.1em] text-[var(--ds-badge-past-fg)] uppercase">
          {t('event.past')}
        </p>
      ) : null}
    </section>
  )
}

export function Fact({
  label,
  value,
  unknown = false,
}: {
  readonly label: string
  readonly value: string
  /**
   * El valor és un «encara no se sap» i no un fet.
   *
   * En violeta, com tot el que la revelació tapa, i no en gris: un «Encara no»
   * del mateix color que una adreça es llegeix com si fos l'adreça.
   */
  readonly unknown?: boolean
}) {
  return (
    <div className="flex gap-6 py-2">
      <p className="w-[64px] flex-none text-2xs font-extrabold tracking-[0.08em] text-fg-dim uppercase">
        {label}
      </p>
      <p
        className={
          'flex-1 text-base [text-wrap:pretty] ' + (unknown ? 'text-unknown' : 'text-fg-secondary')
        }
      >
        {value}
      </p>
    </div>
  )
}

export function Places({
  total,
  puntos,
  left,
  going,
  isPast,
  waiting,
}: {
  /** Places the event has, or null when it has no cap. */
  readonly total: number | null
  readonly puntos: number
  readonly left: number | null
  readonly going: number
  readonly isPast: boolean
  readonly waiting: number
}) {
  const { t } = useTranslation()

  if (isPast) {
    return (
      <section className={`flex items-end gap-9 pt-9 ${GUTTER}`}>
        <div>
          <p className="tabular display text-d-lg leading-[0.85] tracking-[-0.05em]">{going}</p>
          <p className="mt-2 text-sm font-bold text-fg-muted">{t('event.wereThere')}</p>
        </div>
        <div>
          <p className="tabular display text-d-sm leading-[0.85] tracking-[-0.05em] text-brand-accent">
            +{puntos}
          </p>
          <p className="mt-2 text-sm font-bold text-fg-muted">{t('event.pointsForComing')}</p>
        </div>
      </section>
    )
  }

  if (left === null) return null

  // The last place is not the twentieth place. The prototype gives it its own
  // state — amber, "Corre.", and a line saying it will not last — because the
  // number is the whole reason somebody opens this screen twice in an evening.
  const urgent = left === 1

  return (
    <section className={`pt-9 ${GUTTER}`}>
      <p
        className={
          'tabular display text-d-lg leading-[0.85] tracking-[-0.05em] ' +
          (left === 0 || urgent ? 'text-[var(--ds-warning-deep)]' : '')
        }
      >
        {/* "Ple del tot" here and "Ple" on the home hero are deliberately
            different strings: this one is a whole screen about one event and
            it can afford the emphasis. Not a duplicate to collapse. */}
        {left === 0 ? t('event.full') : t('home.places.left', { count: left })}
      </p>
      <p className="mt-4 text-sm font-bold text-fg-muted [text-wrap:pretty]">
        {left === 0
          ? waiting > 0
            ? t('event.fullWithQueue', { count: waiting })
            : t('event.fullNoQueue')
          : urgent
            ? t('event.lastOne', { total })
            : t('home.places.of', { total })}
      </p>
      {urgent ? (
        <p className="mt-3 text-sm text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
          {t('event.lastOneSub')}
        </p>
      ) : null}
    </section>
  )
}
