import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { IN_PROGRESS_MS } from '@/features/home/api'
import { formatTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import type { EventRow } from '@/lib/schema'

import { fetchNights, photoKeys } from './api'
import { dismissExitCard, shouldOfferExitPhoto } from './exitCard'

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

export function ExitPhotoCard({ event }: { readonly event: EventRow | null }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.language)
  const [hidden, setHidden] = useState(false)

  const nights = useQuery({
    queryKey: photoKeys.nights(),
    queryFn: fetchNights,
    enabled: event !== null,
  })
  const night = nights.data?.find((n) => n.event_id === event?.id)

  // The last event the home screen knows about, which is the only one the card
  // could ever be about: anything older is outside the window.
  const offer =
    event !== null &&
    night !== undefined &&
    shouldOfferExitPhoto(endOf(event), night.exit_photo_url !== null, event.id)

  if (hidden || !offer || event === null || night === undefined) return null
  const inAt = night.checked_in_at === null ? null : new Date(night.checked_in_at)

  return (
    <section className="mt-9 border border-surface-8 bg-surface-2 px-8 py-9">
      <p className="eyebrow text-brand-accent">{t('exitCard.eyebrow')}</p>
      <h2 className="display mt-5 text-[27px] leading-[0.98] tracking-[-0.042em] [text-wrap:balance]">
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
            setHidden(true)
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

/** When the party was over, which is not when it started. */
function endOf(event: EventRow): Date {
  return new Date(event.ends_at ?? new Date(event.starts_at).getTime() + IN_PROGRESS_MS)
}
