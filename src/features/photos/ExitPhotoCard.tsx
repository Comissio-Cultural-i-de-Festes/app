import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { formatTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import type { EventRow } from '@/lib/schema'

import { photoKeys } from './api'
import { dismissExitCard } from './exitCard'
import { useExitOffer } from './useExitOffer'

/**
 * The morning after.
 *
 * The one place the app asks for anything, and it asks once. Never a camera
 * that opens by itself: the drawings are explicit about it — «una càmera que
 * s'obre sola a les onze del matí és una emboscada» — so this is a card with
 * a button on it and a way to say no.
 *
 * Which night it is about is worked out from what the member actually did, not
 * from what is on the calendar: the newest event they were checked in to,
 * within the window, with no photograph of their own yet.
 */

export function ExitPhotoCard({ event: candidate }: { readonly event: EventRow | null }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.language)
  const client = useQueryClient()

  // La decisió viu a `useExitOffer` perquè l'Inici l'ha de poder consultar
  // abans de renderitzar res: per damunt del hero només hi cap un avís.
  const offer = useExitOffer(candidate)

  if (offer === null) return null
  const { event, night } = offer
  const inAt = night.checked_in_at === null ? null : new Date(night.checked_in_at)

  return (
    <section className="mt-9 border border-surface-8 bg-surface-2 px-8 py-9">
      <p className="eyebrow text-brand-accent">{t('exitCard.eyebrow')}</p>
      <h2 className="display mt-5 text-d-sm leading-[0.98] tracking-[-0.042em] [text-wrap:balance]">
        {t('exitCard.title')}
      </h2>
      <p className="mt-5 text-base text-fg-secondary [text-wrap:pretty]">
        {inAt === null
          ? t('exitCard.body', { titol: event.titulo })
          : t('exitCard.bodyWithTime', { titol: event.titulo, hora: formatTime(inAt, locale) })}
      </p>

      <Link
        to={`/perfil/nits/${event.id}/camera`}
        className="mt-8 flex min-h-[56px] w-full items-center justify-center bg-brand-cta px-8 py-7 text-lg font-bold text-on-brand no-underline [text-wrap:balance]"
      >
        {t('diptych.takeExit')}
      </Link>

      <div className="mt-6 flex items-center justify-between gap-6">
        <button
          type="button"
          onClick={() => {
            dismissExitCard(event.id)
            void client.invalidateQueries({ queryKey: photoKeys.exitDismissed(event.id) })
          }}
          className="min-h-[44px] text-base font-bold text-fg-secondary"
        >
          {t('exitPhoto.notNow')}
        </button>
        <span className="text-[12.5px] text-fg-muted [text-wrap:pretty]">
          {t('exitCard.closesTonight')}
        </span>
      </div>
    </section>
  )
}
