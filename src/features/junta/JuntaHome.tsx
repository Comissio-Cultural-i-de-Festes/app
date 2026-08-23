import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { warmDecoder } from '@/features/door/decoder'

import { fetchUpcoming, homeKeys, horizonIso } from '@/features/home/api'
import { useMyProfile } from '@/features/session/useMyProfile'
import { formatDateTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'

import { JuntaHeader } from './JuntaHeader'
import { errorKey } from '@/lib/errors'

import { fetchJuntaEvents, juntaEventKeys } from './eventsApi'

/**
 * The way in to everything the junta does.
 *
 * Not in the prototype — the four junta screens all draw a "‹ Junta" back link
 * to a screen that was never designed. Rather than invent a layout, this is
 * the same list rows the rest of the app already uses.
 *
 * The next event comes first and carries the two things that only happen while
 * standing at a door. Everything else is a list.
 */

const GUTTER = 'px-[var(--ds-gutter)]'
const ROW = 'flex items-center gap-4 border-b border-surface-4 py-[17px] no-underline min-h-[60px]'

export function JuntaHome() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const { data: profile } = useMyProfile()

  const horizon = horizonIso()
  const upcoming = useQuery({
    queryKey: homeKeys.upcoming(horizon),
    queryFn: () => fetchUpcoming(horizon),
  })
  const next = upcoming.data?.[0] ?? null

  // Fetched here rather than at the door. This screen is opened on the way to
  // the venue; the scanner is opened inside it, where there is no signal.
  useEffect(() => {
    if (navigator.onLine) void warmDecoder()
  }, [])

  // Its own query rather than the member list: this one has to show the
  // drafts, which is the only way back to something saved and not published.
  const events = useQuery({
    queryKey: juntaEventKeys.list(horizon),
    queryFn: () => fetchJuntaEvents(horizon),
  })

  return (
    <main className="min-h-dvh bg-app pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
      <JuntaHeader to="/perfil" label={t('nav.profile')} title={t('junta.title')} />

      {upcoming.isError ? (
        <p
          role="alert"
          className={`pt-8 text-md font-bold text-error [text-wrap:pretty] ${GUTTER}`}
        >
          {t(errorKey(upcoming.error))}
        </p>
      ) : null}

      {next === null ? null : (
        <section className={`pt-8 ${GUTTER}`}>
          <h2 className="eyebrow text-brand-accent">{t('junta.door')}</h2>
          <p className="mt-4 text-xl font-bold [text-wrap:balance]">{next.titulo}</p>
          <p className="mt-1 text-sm text-fg-muted">
            {formatDateTime(new Date(next.starts_at), locale)}
          </p>

          {/* Two taps from opening the app to scanning, because at the door
              there is nobody free to go looking for it. */}
          <div className="mt-6 grid grid-cols-2 gap-4">
            <Link
              to={`/junta/escaner/${next.id}`}
              className="flex min-h-[60px] items-center justify-center bg-brand-cta px-4 text-lg font-bold text-on-brand no-underline [text-wrap:balance]"
            >
              {t('junta.scan')}
            </Link>
            <Link
              to={`/junta/punts/${next.id}`}
              className="flex min-h-[60px] items-center justify-center border-[1.5px] border-surface-7 bg-surface-1 px-4 text-lg font-bold text-fg no-underline [text-wrap:balance]"
            >
              {t('junta.givePoints')}
            </Link>
          </div>
        </section>
      )}

      <section className={`pt-12 ${GUTTER}`}>
        <h2 className="eyebrow text-fg-muted">{t('junta.manage')}</h2>
        <ul className="mt-2">
          <Row
            to="/junta/esdeveniment/nou"
            title={t('junta.newEvent')}
            sub={t('junta.newEventSub')}
          />
          <Row
            to="/junta/invitacions"
            title={t('junta.invites.title')}
            sub={t('junta.invitesSub')}
          />
          <Row
            to="/junta/pagaments"
            title={t('junta.payments.title')}
            sub={t('junta.paymentsSub')}
          />
          <Row
            to="/junta/periodes"
            title={t('junta.config.title')}
            sub={t('junta.configSub')}
          />
        </ul>
      </section>

      <section className={`pt-12 ${GUTTER}`}>
        <h2 className="eyebrow text-fg-muted">{t('junta.events')}</h2>
        {events.isPending ? (
          <p className="py-8 text-fg-muted">{t('state.loading')}</p>
        ) : events.isError ? (
          <p role="alert" className="py-8 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(events.error))}
          </p>
        ) : (events.data?.length ?? 0) === 0 ? (
          <p className="py-8 text-md text-fg-muted [text-wrap:pretty]">{t('junta.noEvents')}</p>
        ) : (
          <ul className="mt-2">
            {events.data?.map((e) => (
              <li key={e.id}>
                <Link to={`/junta/esdeveniment/${e.id}`} className={ROW}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-fg">
                      {e.titulo}
                    </span>
                    <span className="mt-[3px] block text-[12.5px] text-[var(--ds-text-muted-lo)]">
                      {formatDateTime(new Date(e.starts_at), locale)}
                      {e.published ? '' : ` · ${t('junta.draft')}`}
                    </span>
                  </span>
                  <span aria-hidden="true" className="flex-none text-2xl text-fg-faint">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className={`pt-12 text-sm text-[var(--ds-text-muted-lo)] [text-wrap:pretty] ${GUTTER}`}>
        {profile?.role === 'owner' ? t('junta.youAreOwner') : t('junta.youAreAdmin')}
      </p>
    </main>
  )
}

function Row({
  to,
  title,
  sub,
}: {
  readonly to: string
  readonly title: string
  readonly sub: string
}) {
  return (
    <li>
      <Link to={to} className={ROW}>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-fg">{title}</span>
          <span className="mt-[3px] block text-[12.5px] text-[var(--ds-text-muted-lo)]">{sub}</span>
        </span>
        <span aria-hidden="true" className="flex-none text-2xl text-brand-accent">
          ›
        </span>
      </Link>
    </li>
  )
}
