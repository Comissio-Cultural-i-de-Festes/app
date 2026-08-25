import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { formatTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'

import { fetchNights, fetchPhotoUrls, pathsOf, photoKeys } from './api'

/**
 * "La teva nit", on a past event's own page.
 *
 * The difference between this and the card on the home screen is how long it
 * lasts: the card is a nudge and goes away by the next night, and this stays
 * for ever. Somebody who thinks of it a fortnight later has to be able to find
 * it, and the only place they will look is the event.
 *
 * Renders nothing at all for a night you were not checked in to. Not an empty
 * state — there is nothing to say to somebody who was not there, and saying it
 * anyway on every past event would be noise on every past event.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function MyNightBlock({ eventId }: { readonly eventId: string }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.language)

  const nights = useQuery({ queryKey: photoKeys.nights(), queryFn: fetchNights })
  const night = nights.data?.find((n) => n.event_id === eventId)

  const paths = night === undefined ? [] : pathsOf([night])
  const urls = useQuery({
    queryKey: photoKeys.urls(paths),
    queryFn: () => fetchPhotoUrls(paths),
    enabled: paths.length > 0,
  })

  if (night === undefined) return null

  const entry = night.entry_photo_url
  const exit = night.exit_photo_url
  const inAt = night.checked_in_at === null ? null : new Date(night.checked_in_at)
  const outAt = night.exit_photo_at === null ? null : new Date(night.exit_photo_at)

  return (
    <section className={`pt-12 ${GUTTER}`}>
      <h2 className="eyebrow text-fg-muted">{t('diptych.yourNight')}</h2>

      <div className="mt-7 flex gap-6">
        <Pane
          src={entry === null ? null : (urls.data?.get(entry) ?? null)}
          label={
            inAt === null
              ? t('diptych.entry')
              : `${t('diptych.entry')} · ${formatTime(inAt, locale)}`
          }
          missing={t('diptych.entryMissing')}
          alt={t('diptych.entry')}
        />
        <Pane
          src={exit === null ? null : (urls.data?.get(exit) ?? null)}
          label={
            outAt === null
              ? `${t('diptych.exit')} · ${t('diptych.pending')}`
              : `${t('diptych.exit')} · ${formatTime(outAt, locale)}`
          }
          missing={t('diptych.exitMissing')}
          alt={t('diptych.exit')}
        />
      </div>

      {exit === null ? (
        <>
          <Link
            to={`/perfil/nits/${eventId}/camera`}
            className="mt-8 flex min-h-[56px] w-full items-center justify-center bg-brand-cta px-8 py-7 text-lg font-bold text-on-brand no-underline [text-wrap:balance]"
          >
            {t('diptych.takeExit')}
          </Link>
          <p className="mt-5 text-sm text-fg-muted [text-wrap:pretty]">{t('diptych.staysHere')}</p>
        </>
      ) : (
        <Link
          to={`/perfil/nits/${eventId}`}
          className="mt-8 flex min-h-[56px] w-full items-center justify-center border border-surface-8 bg-surface-2 px-8 py-7 text-md font-bold text-fg no-underline [text-wrap:balance]"
        >
          {t('diptych.seeIt')}
        </Link>
      )}
    </section>
  )
}

function Pane({
  src,
  label,
  missing,
  alt,
}: {
  readonly src: string | null
  readonly label: string
  readonly missing: string
  readonly alt: string
}) {
  return (
    <div className="min-w-0 flex-1">
      {src === null ? (
        <p className="grid h-[150px] place-items-center border-[1.5px] border-dashed border-surface-8 px-6 text-center text-sm font-semibold text-fg-muted [text-wrap:pretty]">
          {missing}
        </p>
      ) : (
        <img src={src} alt={alt} className="h-[150px] w-full bg-surface-3 object-cover" />
      )}
      <p className="eyebrow mt-4 text-[11px] text-fg-muted">{label}</p>
    </div>
  )
}
