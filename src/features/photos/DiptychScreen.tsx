import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { brand } from '@/config/brand'
import { JuntaHeader } from '@/features/junta/JuntaHeader'
import { ShareCard } from '@/features/share/ShareCard'
import { formatDateLong, formatDayMonth, formatTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { type Card, loadCardImage } from '@/lib/cards'
import { errorKey } from '@/lib/errors'

import {
  type Night,
  fetchNights,
  fetchPhotoUrls,
  pathsOf,
  photoKeys,
  removeExitPhoto,
  shapeOf,
} from './api'

/**
 * Your nights, two photographs at a time.
 *
 * Three cases, all drawn, and the difference between them is the whole screen:
 *
 *   both      the diptych. An arrival and a departure, and the gap between.
 *   entryOnly the scanner got you and you never took yours. Still time.
 *   neither   the junta had the door camera off. Nothing to fix, so no button.
 *
 * The third one is the one worth being careful about. There is nothing to
 * retry and nothing anybody did wrong, so it gets no orange button and no
 * "torna-ho a provar": an empty state that offers an action implies the
 * emptiness is your fault.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function DiptychScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.language)
  const { eventId } = useParams()
  const queryClient = useQueryClient()

  const nights = useQuery({ queryKey: photoKeys.nights(), queryFn: fetchNights })
  const all = nights.data ?? []

  // No id in the path means the newest night you were at, which is what
  // somebody arriving from the profile is looking for.
  const night = eventId === undefined ? all[0] : all.find((n) => n.event_id === eventId)
  const others = all.filter((n) => n.event_id !== night?.event_id)

  const paths = pathsOf(all)
  const urls = useQuery({
    queryKey: photoKeys.urls(paths),
    queryFn: () => fetchPhotoUrls(paths),
    enabled: paths.length > 0,
  })
  const url = (path: string | null) => (path === null ? null : urls.data?.get(path) ?? null)

  const forget = useMutation({
    mutationFn: (id: string) => removeExitPhoto(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: photoKeys.nights() })
    },
  })

  if (nights.isPending) {
    return (
      <Shell>
        <p className={`pt-10 text-fg-muted ${GUTTER}`}>{t('state.loading')}</p>
      </Shell>
    )
  }

  if (nights.isError) {
    return (
      <Shell>
        <p role="alert" className={`pt-10 text-md font-bold text-error [text-wrap:pretty] ${GUTTER}`}>
          {t(errorKey(nights.error))}
        </p>
      </Shell>
    )
  }

  if (night === undefined) {
    return (
      <Shell>
        <p className={`pt-10 text-md text-fg-secondary [text-wrap:pretty] ${GUTTER}`}>
          {t('diptych.noNights')}
        </p>
      </Shell>
    )
  }

  const shape = shapeOf(night)
  const starts = new Date(night.starts_at)
  const inAt = night.checked_in_at === null ? null : new Date(night.checked_in_at)
  const outAt = night.exit_photo_at === null ? null : new Date(night.exit_photo_at)
  const howLong = inAt === null || outAt === null ? null : span(inAt, outAt, t)

  return (
    <Shell>
      <div className={`pt-7 ${GUTTER}`}>
        <h1 className="display text-[30px] leading-[0.95] tracking-[-0.045em] [text-wrap:balance]">
          {night.titulo}
        </h1>
        <p className="mt-4 text-sm text-fg-muted [text-wrap:pretty]">
          {formatDateLong(starts, locale)}
          {howLong === null ? '' : ` · ${t('diptych.youWereThere', { long: howLong })}`}
        </p>
      </div>

      {shape === 'neither' ? (
        <section className={`pt-9 pb-4 ${GUTTER}`}>
          <h2 className="display text-[27px] leading-[0.98] tracking-[-0.042em] [text-wrap:balance]">
            {t('diptych.neither.title')}
          </h2>
          <p className="mt-5 text-base text-fg-secondary [text-wrap:pretty]">
            {t('diptych.neither.body')}
          </p>
          <p className="mt-5 text-sm text-fg-muted [text-wrap:pretty]">
            {t('diptych.neither.nextTime')}
          </p>
        </section>
      ) : (
        <>
          <section className="pt-9">
            <div className={`flex gap-[3px] ${GUTTER}`}>
              <Half
                label={t('diptych.entry')}
                src={url(night.entry_photo_url)}
                time={inAt === null ? null : formatTime(inAt, locale)}
                missing={t('diptych.entryMissing')}
              />
              <Half
                label={t('diptych.exit')}
                src={url(night.exit_photo_url)}
                time={outAt === null ? null : formatTime(outAt, locale)}
                missing={t('diptych.exitMissing')}
                brand
              />
            </div>
            <p className={`mt-7 text-base text-fg-secondary [text-wrap:pretty] ${GUTTER}`}>
              {shape === 'both' ? t('diptych.worseOut') : t('diptych.stillTime')}
            </p>
          </section>

          <section className={`pt-9 ${GUTTER}`}>
            {night.exit_photo_url === null ? (
              <Link
                to={`/perfil/nits/${night.event_id}/camera`}
                className="flex min-h-[56px] w-full items-center justify-center bg-brand-cta px-8 py-7 text-lg font-bold text-on-brand no-underline [text-wrap:balance]"
              >
                {t('diptych.takeExit')}
              </Link>
            ) : null}

            {/* Only with both halves. Sharing one is not a diptych, and the
                drawings say so: «sense les dues, no hi ha díptic». */}
            {shape === 'both' ? (
              <div className="mb-8">
                <ShareCard
                  card={async (): Promise<Card> => ({
                    kind: 'diptych',
                    entry: await loadCardImage(url(night.entry_photo_url)),
                    exit: await loadCardImage(url(night.exit_photo_url)),
                    entryLabel: t('share.entryLabel'),
                    entryTime: inAt === null ? '' : formatTime(inAt, locale),
                    exitLabel: t('share.exitLabel'),
                    exitTime: outAt === null ? '' : formatTime(outAt, locale),
                    title: night.titulo,
                    subtitle: `${brand.name} · ${formatDayMonth(starts, locale)}`,
                    badge: howLong,
                  })}
                  name={[night.titulo, 'diptic']}
                />
              </div>
            ) : null}

            <p className="mt-5 border-l-[3px] border-brand-cta bg-surface-3 px-7 py-6 text-sm text-fg-secondary [text-wrap:pretty]">
              {t('diptych.nobodyElse')}
            </p>

            {night.exit_photo_url === null ? null : (
              <button
                type="button"
                disabled={forget.isPending}
                onClick={() => {
                  forget.mutate(night.event_id)
                }}
                className="mt-6 inline-flex min-h-[46px] items-center text-base font-bold text-[var(--ds-warning)] disabled:opacity-50"
              >
                {t('diptych.forgetExit')}
              </button>
            )}

            {forget.isError ? (
              <p role="alert" className="mt-4 text-md font-bold text-error [text-wrap:pretty]">
                {t(errorKey(forget.error))}
              </p>
            ) : null}
          </section>
        </>
      )}

      {others.length === 0 ? null : (
        <section className={`mt-10 border-t border-surface-5 pt-8 pb-10 ${GUTTER}`}>
          <h2 className="eyebrow text-fg-muted">{t('diptych.previous')}</h2>
          <ul className="mt-7">
            {others.map((other) => (
              <li key={other.event_id} className="border-b border-surface-4 last:border-b-0">
                <Link
                  to={`/perfil/nits/${other.event_id}`}
                  className="flex min-h-[64px] items-center gap-6 py-6 text-fg no-underline"
                >
                  <span aria-hidden="true" className="flex flex-none gap-[2px]">
                    <Chip src={url(other.entry_photo_url)} />
                    <Chip src={url(other.exit_photo_url)} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold">{other.titulo}</span>
                    <span className="mt-2 block text-sm text-fg-muted">{summary(other, locale, t)}</span>
                  </span>
                  <span aria-hidden="true" className="flex-none text-lg text-fg-muted">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  )
}

function Shell({ children }: { readonly children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <main className="with-tabbar min-h-dvh bg-app">
      <JuntaHeader to="/perfil" label={t('nav.profile')} title={t('diptych.title')} />
      {children}
    </main>
  )
}

/** One half. A dashed box where a photograph is missing, never a broken image. */
function Half({
  label,
  src,
  time,
  missing,
  brand = false,
}: {
  readonly label: string
  readonly src: string | null
  readonly time: string | null
  readonly missing: string
  readonly brand?: boolean
}) {
  return (
    <div className="min-w-0 flex-1">
      {src === null ? (
        <p className="grid h-[232px] place-items-center border-[1.5px] border-dashed border-surface-8 px-6 text-center text-sm font-semibold text-fg-muted [text-wrap:pretty]">
          {missing}
        </p>
      ) : (
        <div className="relative h-[232px]">
          <img src={src} alt={label} className="size-full bg-surface-3 object-cover" />
          <span
            className={`eyebrow absolute top-0 left-0 px-5 py-3 text-[10.5px] ${
              brand ? 'bg-brand-cta text-on-brand' : 'bg-[oklch(0.13_0.012_25/0.85)] text-fg'
            }`}
          >
            {label}
          </span>
        </div>
      )}
      <p className="display mt-4 text-2xl tracking-[-0.045em] tabular-nums">{time ?? '—'}</p>
    </div>
  )
}

function Chip({ src }: { readonly src: string | null }) {
  return src === null ? (
    <span className="block h-[46px] w-[34px] border-[1.5px] border-dashed border-surface-7" />
  ) : (
    <img src={src} alt="" className="h-[46px] w-[34px] bg-surface-3 object-cover" />
  )
}

/** i18next's own `t`, which under exactOptionalPropertyTypes cannot be
 *  narrowed to a hand-written signature. */
type T = ReturnType<typeof useTranslation>['t']

/**
 * A party, at the outside. Anything longer than this is not how long somebody
 * was there.
 *
 * The screen only knows two moments: when the scanner let you in, and when you
 * took your own photograph. Those are the same night if you took it on the way
 * out — and the app tells you, in as many words, that you can take it a
 * fortnight later. So the gap is a length of time only when it plausibly is
 * one, and otherwise the line simply is not there. «Hi vas ser 1080 h» is
 * worse than saying nothing.
 */
const SAME_NIGHT_MS = 14 * 3_600_000

/** "4 h 31", which is a length of time and not a clock reading. */
function span(from: Date, to: Date, t: T): string | null {
  const ms = to.getTime() - from.getTime()
  if (ms <= 0 || ms > SAME_NIGHT_MS) return null

  const minutes = Math.round(ms / 60_000)
  const hours = Math.floor(minutes / 60)
  return hours === 0
    ? t('diptych.minutes', { count: minutes })
    : t('diptych.hoursMinutes', {
        hours,
        // Padded so "4 h 07" cannot be read as seven of anything else.
        minutes: String(minutes % 60).padStart(2, '0'),
      })
}

function summary(night: Night, locale: ReturnType<typeof toLocale>, t: T): string {
  const day = formatDateLong(new Date(night.starts_at), locale)
  const shape = shapeOf(night)
  if (shape === 'neither') return `${day} · ${t('diptych.noPhotos')}`
  if (shape === 'entryOnly') return `${day} · ${t('diptych.entryOnly')}`

  const inAt = night.checked_in_at === null ? null : formatTime(new Date(night.checked_in_at), locale)
  const outAt = night.exit_photo_at === null ? null : formatTime(new Date(night.exit_photo_at), locale)
  return inAt === null || outAt === null ? day : `${day} · ${inAt} → ${outAt}`
}
