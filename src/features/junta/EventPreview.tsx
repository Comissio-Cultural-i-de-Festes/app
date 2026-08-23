import { useTranslation } from 'react-i18next'

import { Cover, Fact, Places } from '@/features/event/detail'
import { formatPrice } from '@/features/event/api'
import { formatDateLong, formatTime } from '@/i18n/format'
import { INTL_LOCALE, type Locale } from '@/i18n/locales'

/**
 * What the association will see, before anybody sees it.
 *
 * The junta writes an event on a phone between two lectures and publishes it
 * to two hundred people. Everything on the form is a field with a label; none
 * of it is what the thing actually looks like, and the two states that matter
 * most — a cover that turns out to be a portrait, a teaser that gives the whole
 * thing away — are invisible from the form.
 *
 * Drawn with the real components from the member's screen, not a mock-up of
 * them. A preview that is a second implementation is a preview that starts
 * lying the first time somebody changes one of the two.
 */

export interface PreviewData {
  readonly titulo: string
  readonly teaser: string
  readonly startsAt: Date | null
  readonly endsAt: Date | null
  readonly ubicacion: string
  readonly plazas: number | null
  readonly precioCents: number
  readonly coverUrl: string | null
  readonly transport: string
  readonly descripcion: string
  /** Whether the reveal clock is set and still in the future. */
  readonly hidden: boolean
}

const GUTTER = 'px-[var(--ds-gutter)]'

export function EventPreview({
  data,
  locale,
  onClose,
}: {
  readonly data: PreviewData
  readonly locale: Locale
  readonly onClose: () => void
}) {
  const { t } = useTranslation()
  const price = formatPrice(data.precioCents, INTL_LOCALE[locale])

  // Everything the reveal hides comes from `event_details`, so a covered event
  // is not this screen with some fields greyed out — it is a different, much
  // emptier screen. Showing the covered version is half the reason to look.
  const covered = data.hidden

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('junta.form.preview')}
      className="fixed inset-0 z-50 overflow-y-auto bg-app"
    >
      <Cover
        coverUrl={covered ? null : data.coverUrl}
        isPast={false}
        corner={
          <button
            type="button"
            onClick={onClose}
            aria-label={t('actions.close')}
            className="grid size-[44px] place-items-center rounded-full bg-[oklch(0.15_0.012_25/0.7)] text-2xl text-fg backdrop-blur-[6px]"
          >
            <span aria-hidden="true">✕</span>
          </button>
        }
      />

      <p
        className={`eyebrow pt-8 text-[var(--ds-unknown)] ${GUTTER}`}
        // Says what you are looking at, so nobody mistakes it for the live
        // thing and wonders why the buttons do nothing.
      >
        {covered ? t('junta.form.previewCovered') : t('junta.form.previewLive')}
      </p>

      <section className={`pt-4 ${GUTTER}`}>
        {data.startsAt === null ? null : (
          <p className="eyebrow text-brand-accent">
            {formatDateLong(data.startsAt, locale)}
            {data.endsAt === null ? '' : ` – ${formatTime(data.endsAt, locale)}`}
          </p>
        )}
        <h1 className="display mt-4 text-d-md leading-[0.88] tracking-[-0.05em] [overflow-wrap:break-word] [text-wrap:balance]">
          {data.titulo.trim() === '' ? t('junta.form.previewTitle') : data.titulo}
        </h1>
        {data.teaser.trim() === '' ? null : (
          <p className="mt-6 text-lg text-fg-secondary [text-wrap:pretty]">{data.teaser}</p>
        )}
      </section>

      {covered ? (
        <p className={`pt-9 pb-12 text-md text-fg-muted [text-wrap:pretty] ${GUTTER}`}>
          {t('junta.form.previewHiddenFields')}
        </p>
      ) : (
        <>
          <section className={`mt-9 border-y border-surface-4 py-6 ${GUTTER}`}>
            {data.startsAt === null ? null : (
              <Fact
                label={t('event.facts.when')}
                value={
                  data.endsAt === null
                    ? formatDateLong(data.startsAt, locale)
                    : t('event.facts.until', {
                        from: formatDateLong(data.startsAt, locale),
                        to: formatTime(data.endsAt, locale),
                      })
                }
              />
            )}
            {data.ubicacion.trim() === '' ? null : (
              <Fact label={t('event.facts.where')} value={data.ubicacion} />
            )}
            {price === null ? null : <Fact label={t('event.facts.price')} value={price} />}
          </section>

          <Places
            total={data.plazas}
            puntos={0}
            left={data.plazas}
            going={0}
            isPast={false}
            waiting={0}
          />

          {data.transport.trim() === '' ? null : (
            <section className={`pt-12 pb-4 ${GUTTER}`}>
              <h2 className="eyebrow text-fg-muted">{t('event.transport')}</h2>
              <p className="mt-4 text-md text-fg-secondary [text-wrap:pretty]">{data.transport}</p>
            </section>
          )}

          {data.descripcion.trim() === '' ? null : (
            <p className={`pt-9 pb-12 text-md text-fg-secondary [text-wrap:pretty] ${GUTTER}`}>
              {data.descripcion}
            </p>
          )}
        </>
      )}

      <div className={`pb-[calc(env(safe-area-inset-bottom,0px)+24px)] ${GUTTER}`}>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[56px] w-full border-[1.5px] border-surface-7 bg-surface-1 px-8 text-lg font-bold text-fg [text-wrap:balance]"
        >
          {t('junta.form.previewBack')}
        </button>
      </div>
    </div>
  )
}
