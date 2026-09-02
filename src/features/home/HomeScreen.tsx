import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { FailedNotice } from '@/features/checkin/FailedNotice'
import { useFailedCheckin } from '@/features/checkin/useFailedCheckin'
import { PendingLine } from '@/features/checkin/PendingLine'
import { checkinWindow, isOpen } from '@/features/checkin/window'
import { ComebackLine } from '@/features/profile/ComebackLine'
import { firstName } from '@/features/session/profile'

import { movementLine } from './movementLine'
import { useUserId } from '@/features/session/useUserId'
import {
  daysUntil,
  formatDayNumber,
  formatMonthShort,
  formatOrdinal,
  formatTime,
  formatWeekdayLong,
} from '@/i18n/format'
import { type Locale, toLocale } from '@/i18n/locales'
import { countdown, countdownLabel, countdownShape } from '@/features/event/countdown'
import { RevealedCard } from '@/features/event/RevealedCard'
import { InterestBlock, InterestCount } from '@/features/event/Teaser'
import { eventTitle, titleIsHidden } from '@/features/event/title'
import { ExitPhotoCard } from '@/features/photos/ExitPhotoCard'
import { useExitOffer } from '@/features/photos/useExitOffer'
import { errorKey } from '@/lib/errors'
import type { Escola } from '@/lib/model'
import { useOnline } from '@/lib/useOnline'
import { Avatar } from '@/ui/Avatar/Avatar'
import { useCovers } from '@/ui/Cover/useCovers'
import { LogoMark, Wordmark } from '@/ui/Logo/Logo'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import {
  type AttendanceRow,
  type EventRow,
  goingRows,
  myAnswer,
  placesLeft,
  signedUpToday,
} from './api'
import { type Home, useAnswer, useHome } from './useHome'

const GUTTER = 'px-[var(--ds-gutter)]'

/** Els dos candidats a ocupar l'únic lloc que hi ha sobre el hero. */
type HomeNotice = 'failed' | 'exit'
const EYEBROW_TIGHT = 'eyebrow text-fg-muted'

export function HomeScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const home = useHome()
  // One signing round trip for every cover on the screen, rather than one per
  // picture. The buckets are private, so a stored path is not a URL.
  const covers = useCovers([home.hero?.cover_url ?? null, home.previous?.cover_url ?? null])

  // Approved yet? A pending profile can read the calendar — that is what the
  // door promises them — but every write and every list of names is still
  // closed. The screen has to say so, or the only feedback is a button that
  // fails.
  const waiting = home.profile !== null && home.profile.estat !== 'actiu'

  // Cada tasca hi va afegir el seu avís i cadascun és correcte pel seu compte;
  // junts empenyien la foto de l'esdeveniment i el CTA sota la línia de plegat
  // d'un iPhone SE. Els dos segons que ha de costar decidir la nit són
  // exactament el que es trencava.
  //
  // Un de sol per damunt del hero, per ordre: una nit que no va comptar pesa
  // més que una foto que encara es pot fer aquesta nit. L'altre no desapareix:
  // baixa just sota el CTA.
  //
  // Eren tres. El de «encara ets a la llista d'espera» era el que menys hi
  // pintava aquí: és un estat que dura setmanes i val a totes les pantalles,
  // no una cosa que hagi passat avui, i perdia el torn contra un fitxatge
  // fallat justament perquè no competia en la mateixa lliga. Ara és
  // `PendingBanner`, muntat a `TabLayout`.
  const failed = useFailedCheckin() !== undefined
  const exitOffer = useExitOffer(home.previous ?? null) !== null
  const notices = ([failed && 'failed', exitOffer && 'exit'] as const).filter(
    (kind): kind is HomeNotice => kind !== false,
  )

  const notice = (kind: HomeNotice) =>
    kind === 'failed' ? (
      <FailedNotice key={kind} />
    ) : (
      <div key={kind} className={GUTTER}>
        <ExitPhotoCard event={home.previous ?? null} />
      </div>
    )

  return (
    <div className="with-tabbar min-h-dvh bg-app">
      <Header home={home} />

      {/* Abans del hero i no entre els avisos. Els tres candidats de `notices`
          es barallen per l'únic lloc que hi ha *sobre* el hero; això és la
          resposta a una cosa que aquesta persona va demanar explícitament, i
          per això té el seu propi lloc i no cap regla de prioritat. */}
      <RevealedCard />

      {notices.slice(0, 1).map(notice)}

      {home.isError ? (
        <ErrorPanel
          message={t(errorKey(home.error))}
          onRetry={home.refetch}
          label={t('actions.retry')}
        />
      ) : null}

      {/* The empty state is a claim about the calendar. It cannot be made while
          the request that would have filled it is the thing that failed. */}
      {home.isError ? null : home.hero ? (
        <>
          <Hero
            event={home.hero}
            locale={locale}
            coverUrl={covers.data?.get(home.hero.cover_url ?? '') ?? null}
          />
          <Places event={home.hero} attendances={home.attendances} />
          <CallToAction event={home.hero} attendances={home.attendances} waiting={waiting} />
        </>
      ) : home.isPending ? (
        <HeroSkeleton />
      ) : (
        <NothingNext />
      )}

      {/* Els que han perdut el torn. Segueixen sent visibles i segueixen sent
          certs; el que no fan és competir amb la decisió de la nit. */}
      {notices.slice(1).map(notice)}

      <RankingTeaser home={home} />
      {home.previous ? (
        <Recap
          event={home.previous}
          attendances={home.attendances}
          coverUrl={covers.data?.get(home.previous.cover_url ?? '') ?? null}
        />
      ) : null}
      <Upcoming events={home.rest} attendances={home.attendances} locale={locale} />
    </div>
  )
}

// ── header ──────────────────────────────────────────────────────────────────

function Header({ home }: { readonly home: Home }) {
  const { t } = useTranslation()
  const online = useOnline()
  const name = home.profile ? firstName(home.profile.nombre) : ''

  return (
    <header
      className={`sticky top-[var(--ds-sticky-top)] z-20 flex items-center justify-between gap-3 bg-app pt-[max(calc(var(--ds-safe-top)+4px),12px)] pb-6 ${GUTTER}`}
    >
      <div className="flex min-w-0 items-center gap-[10px]">
        <LogoMark size={36} />
        <div className="min-w-0">
          <Wordmark size={22} />
          {/* Al lloc de la salutació i no a sobre: sense cobertura, «bona
              tarda» no és la cosa més útil que aquesta línia pot dir, i un
              rètol nou empenyeria tota la pantalla avall. Ambre, mai el
              vermell de marca, i sense cap toast. */}
          {online ? (
            name === '' ? null : (
              <p className="mt-2 truncate text-xs font-semibold tracking-[0.03em] text-fg-dim">
                {t(`home.greeting.${greetingKey(new Date())}`, { name })}
              </p>
            )
          ) : (
            <p
              role="status"
              className="mt-2 flex items-center gap-3 text-xs font-bold text-[var(--ds-warning-deep)]"
            >
              <span
                aria-hidden="true"
                className="size-[7px] flex-none rounded-full bg-[var(--ds-warning-deep)]"
              />
              {t('state.offline')}
            </p>
          )}
          {/* La cua no és un avís sinó un estat, com el «sense connexió» de
              sobre, amb qui ja comparteix el punt ambre. Sobre el hero només
              hi cap una cosa i no ha de ser aquesta. */}
          <PendingLine className="mt-2" />
        </div>
      </div>

      <div className="flex flex-none items-center gap-[10px]">
        {home.me ? (
          <p className="tabular flex h-[34px] items-center rounded-chip border border-border-strong px-[13px] text-md-lo font-bold">
            {t('units.points', { count: home.me.punts })}
          </p>
        ) : null}
        <Avatar src={home.profile?.avatar_url ?? null} size={38} />
      </div>
    </header>
  )
}

/**
 * Morning, afternoon or night, on the cut-offs Catalan actually uses: "bona
 * tarda" starts after lunch rather than at noon, and the small hours are still
 * "bona nit" — somebody opening the app at one in the morning on the way home
 * has not started their day.
 */
function greetingKey(now: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = now.getHours()
  if (hour < 6) return 'evening'
  if (hour < 13) return 'morning'
  if (hour < 20) return 'afternoon'
  return 'evening'
}

// ── hero ────────────────────────────────────────────────────────────────────

function Hero({
  event,
  locale,
  coverUrl,
}: {
  readonly event: EventRow
  readonly locale: Locale
  readonly coverUrl: string | null
}) {
  const { t } = useTranslation()
  const start = new Date(event.starts_at)
  const hidden = titleIsHidden(event.titulo)

  return (
    <Link
      to={`/esdeveniment/${event.id}`}
      className="relative block h-[260px] overflow-hidden bg-[oklch(0.2_0.02_25)] no-underline"
    >
      {/* La portada d'un esdeveniment no revelat es difumina AQUÍ i no al
          servidor, perquè el camí ja no baixa fins que es revela: el que hi ha
          és el fons de ratlles. El desenfoc es queda per al dia que el camí
          sí que baixi tapat, i perquè la forma sigui la mateixa —`inset -40px`
          perquè un `blur` deixa la vora transparent i es veuria el marc. */}
      {coverUrl === null ? (
        <div
          aria-hidden="true"
          className={
            'absolute bg-[var(--ds-bg-avatar)] bg-[image:var(--ds-pattern-avatar)] ' +
            (hidden ? '-inset-20 blur-[28px] saturate-[1.3]' : 'inset-0')
          }
        />
      ) : (
        <img
          src={coverUrl}
          alt=""
          className={
            'absolute size-full object-cover ' +
            (hidden ? '-inset-20 blur-[28px] saturate-[1.3]' : 'inset-0')
          }
          decoding="async"
        />
      )}

      {/* Reads bottom-up: the title sits on the darkest part, so it stays
          legible over any photo the junta uploads without anyone having to
          check the contrast of each one. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,oklch(0.15_0.012_25/0.5)_0%,oklch(0.15_0.012_25/0.15)_34%,oklch(0.15_0.012_25/0.85)_78%,oklch(0.15_0.012_25)_100%)]"
      />

      <div className="absolute right-4 bottom-4 left-[var(--ds-gutter)]">
        <p className={`eyebrow ${hidden ? 'text-unknown' : 'text-brand-accent'}`}>
          {whenLabel(start, locale, t)}
        </p>
        {/* «? ? ?» amb el `tracking` positiu i en gris: els interrogants amb
            el `tracking` negatiu del display se sobreposen, i en blanc
            competirien amb la data, que aquí és l'única cosa que se sap. */}
        <h1
          className={
            'display mt-4 text-d-md leading-[0.85] [overflow-wrap:break-word] [text-wrap:balance] ' +
            (hidden ? 'tracking-[0.02em] text-fg-muted' : 'tracking-[-0.048em]')
          }
        >
          {eventTitle(event.titulo)}
        </h1>
      </div>
    </Link>
  )
}

type Translate = ReturnType<typeof useTranslation>['t']

/** "Aquest divendres · 21:00", and what it becomes when the day is further off. */
function whenLabel(start: Date, locale: Locale, t: Translate): string {
  const days = daysUntil(start)
  const time = formatTime(start, locale)

  const when =
    days < 0
      ? t('home.when.now')
      : days === 0
        ? t('time.today')
        : days === 1
          ? t('time.tomorrow')
          : days < 7
            ? t('home.when.thisWeekday', { weekday: formatWeekdayLong(start, locale) })
            : `${formatDayNumber(start, locale)} ${formatMonthShort(start, locale)}`

  return t('home.when.withTime', { when, time })
}

// ── places and who is coming ────────────────────────────────────────────────

function Places({
  event,
  attendances,
}: {
  readonly event: EventRow
  readonly attendances: readonly AttendanceRow[]
}) {
  const { t } = useTranslation()
  const going = goingRows(attendances, event.id)
  const left = placesLeft(event, going.length)

  // Only the detail row is reveal-gated; the count is always known.
  const where = event.ubicacion
  const capacity =
    left === null
      ? where
      : where === null
        ? t('home.places.of', { total: event.plazas })
        : `${t('home.places.of', { total: event.plazas })} · ${where}`

  // Un teaser no té places a dir: no se sap ni què és. Al seu lloc hi va el
  // compte enrere i quanta gent hi està pendent, que és el que hi ha.
  if (titleIsHidden(event.titulo) && event.reveal_at !== null) {
    const label = countdownLabel(countdownShape(countdown(event.reveal_at)))
    return (
      <section className={`flex items-end justify-between gap-[14px] pt-8 ${GUTTER}`}>
        <div className="min-w-0">
          <p className="eyebrow-sm text-unknown">{t('event.teaser.willBeKnown')}</p>
          <p className="tabular display mt-3 text-d-md leading-[0.85] tracking-[-0.05em]">
            {t(label.key, label.vars)}
          </p>
        </div>
        <InterestCount eventId={event.id} />
      </section>
    )
  }

  return (
    <section className={`flex items-end justify-between gap-[14px] pt-8 ${GUTTER}`}>
      <div className="min-w-0">
        {/* No cap, no number. The forty-pixel figure exists to say how much
            room is left, and an event with no limit has nothing to say there —
            inventing a word for it would be the loudest thing on the screen
            saying nothing at all. */}
        {left === null ? null : (
          <p className="tabular display text-d-md leading-[0.85] tracking-[-0.05em]">
            {left === 0 ? t('home.places.full') : t('home.places.left', { count: left })}
          </p>
        )}
        {capacity === null ? null : (
          <p className={`text-sm font-bold text-fg-muted ${left === null ? '' : 'mt-[5px]'}`}>
            {capacity}
          </p>
        )}
      </div>

      <div className="flex flex-none items-center gap-4 pb-2">
        <div className="flex items-center">
          {going.slice(0, 3).map((row, index) => (
            <span
              key={row.user_id}
              // Overlapping, front to back, each cut out of the background so
              // the stack reads as a stack rather than as a smear.
              className="relative rounded-full border-2 border-app [box-sizing:content-box]"
              style={{ marginLeft: index === 0 ? 0 : -11, zIndex: 3 - index }}
            >
              <Avatar src={row.profiles?.avatar_url ?? null} size={30} />
            </span>
          ))}
        </div>
        <p className="text-sm font-bold text-fg-secondary">
          {t('home.going', { count: going.length })}
        </p>
      </div>
    </section>
  )
}

// ── the answer ──────────────────────────────────────────────────────────────

/**
 * Un teaser no porta el botó d'apuntar-se, porta «Avisa'm».
 *
 * Abans d'aquí hi hauria hagut el botó de sempre, desactivat, i un botó
 * desactivat en un esdeveniment que ningú no sap què és no explica res: la
 * gent el prem i no passa res. El bloc de l'interès es busca les seves pròpies
 * dades i entra en una línia.
 */
function CallToAction({
  event,
  attendances,
  waiting,
}: {
  readonly event: EventRow
  readonly attendances: readonly AttendanceRow[]
  readonly waiting: boolean
}) {
  const { t } = useTranslation()
  const userId = useUserId()
  const answer = useAnswer()
  const mine = myAnswer(attendances, event.id, userId)
  const going = mine === 'si' || mine === 'asistio'

  // Un sol instant per a tot el render: llegir l'hora dues vegades pot posar
  // «encara s'hi pot fitxar» i «s'hi han apuntat avui» en desacord.
  const [now] = useState(() => new Date())
  const names = signedUpToday(attendances, event.id, userId, now)

  // Fitxar era el flux més car de l'app: obrir, tocar el hero, recórrer avall
  // per cares, fets i places, i llavors «Sóc aquí». Mentre la finestra és
  // oberta i encara no consto dins, el CTA porta directe a l'àncora del bloc:
  // un toc, zero scroll. La finestra la decideix `checkin/window.ts`, la
  // mateixa regla que fa aparèixer el bloc a l'altra banda.
  // Només per a qui hi anava. Amb `mine !== 'asistio'` a seques, qui havia dit
  // que no —o no havia contestat— rebia com a acció principal de la nit un
  // botó per fitxar en un lloc on no pensava anar, i perdia el d'apuntar-s'hi.
  const canCheckIn =
    (mine === 'si' || mine === 'potser') &&
    isOpen(checkinWindow(event.starts_at, event.ends_at), now.getTime())

  const base =
    'flex w-full min-h-[56px] items-center justify-center px-[18px] py-[15px] ' +
    'text-[18px] font-bold tracking-[-0.01em] text-center [text-wrap:balance] rounded-cta'

  // Un teaser no té res a què apuntar-se. El bloc de l'interès ocupa el lloc
  // del botó, i porta la seva pròpia explicació perquè el botó sol es
  // llegiria com «M'hi apunto» pel lloc on està.
  if (titleIsHidden(event.titulo)) {
    return (
      <section className={GUTTER}>
        <InterestBlock eventId={event.id} size="hero" />
      </section>
    )
  }

  return (
    <section className={`pt-8 ${GUTTER}`}>
      {waiting ? (
        // Not approved yet. The banner above says why; the button keeps its
        // own label so the screen reads the same as everybody else's, which is
        // the point of letting them in this far at all.
        <button type="button" disabled className={`${base} bg-surface-2 text-fg-muted opacity-70`}>
          {t('home.cta.join')}
        </button>
      ) : canCheckIn ? (
        <Link
          to={`/esdeveniment/${event.id}#soc-aqui`}
          className={`${base} bg-brand-cta text-on-brand no-underline`}
        >
          {t('checkin.here')}
        </Link>
      ) : going ? (
        // Qui ja ha dit que sí és el públic que volem retenir, i aquest és
        // l'únic CTA que veu. Porta a l'esdeveniment, que és on hi ha el
        // sí/potser/no: secundari perquè la decisió ja està presa, però viu,
        // amb el xevró que diu que aquí es va a algun lloc.
        <Link
          to={`/esdeveniment/${event.id}`}
          className={`${base} gap-3 border-[1.5px] border-surface-9 bg-surface-2 text-fg-secondary no-underline`}
        >
          {t('home.cta.going')}
          <span aria-hidden="true" className="flex-none text-[20px]">
            ›
          </span>
        </Link>
      ) : (
        <button
          type="button"
          disabled={answer.isPending}
          onClick={() => {
            answer.mutate({ eventId: event.id, estado: 'si' })
          }}
          className={`${base} bg-brand-cta text-on-brand disabled:opacity-70`}
        >
          {answer.isPending
            ? t('state.updating')
            : mine === 'potser'
              ? t('home.cta.confirm')
              : t('home.cta.join')}
        </button>
      )}

      {answer.isError ? (
        <p role="alert" className="mt-[10px] text-md-lo text-error">
          {t(errorKey(answer.error))}
        </p>
      ) : null}

      {names.length > 0 ? (
        <p className="mt-[10px] flex items-center gap-[9px] text-md-lo text-fg-muted">
          <span
            aria-hidden="true"
            className="size-[9px] flex-none rounded-full bg-brand [animation:comi-pulse_var(--ds-pulse-dur)_ease-in-out_infinite]"
          />
          <span className="flex-1 [text-wrap:pretty]">{movementLine(names, t)}</span>
        </p>
      ) : null}
    </section>
  )
}

// ── the ranking strip ───────────────────────────────────────────────────────

function RankingTeaser({ home }: { readonly home: Home }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  if (!home.me) return null

  const mine = home.profile?.escola ?? null
  const school = mine === null ? null : (home.schools.find((s) => s.escola === mine) ?? null)
  const above =
    school === null ? null : (home.schools.find((s) => s.posicio === school.posicio - 1) ?? null)

  // What the school would need in total points to draw level, which is the
  // per-member gap multiplied back out by how many of them there are.
  const gap =
    school === null || above === null
      ? null
      : Math.max(0, Math.round((above.punts_per_membre - school.punts_per_membre) * school.membres))

  return (
    <section className={`mt-12 border-y border-surface-7 py-[18px] ${GUTTER}`}>
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className={EYEBROW_TIGHT}>
            {t('home.rank.you', {
              position: formatOrdinal(home.me.posicio, locale),
              total: home.total,
            })}
          </p>
          <p className="tabular display mt-[7px] text-d-lg leading-[0.85] tracking-[-0.05em]">
            {home.me.punts}{' '}
            <span className="font-body text-xl font-bold tracking-normal text-fg-muted normal-case">
              {t('home.rank.pointsWord')}
            </span>
          </p>
        </div>

        {school ? (
          <div className="pb-[5px] text-right">
            <p className="text-sm font-bold text-brand-accent">
              {/* The subject form, with its article: "La Politècnica va 2a",
                  "L'Empresa va 2a". Catalan contracts the article against the
                  next word, so this cannot be assembled from the plain name in
                  code — each form is its own key. */}
              {t('home.rank.school', {
                school: t(`escolaSubject.${school.escola satisfies Escola}`),
                position: formatOrdinal(school.posicio, locale, 'f'),
              })}
            </p>
            {gap !== null && above ? (
              <p className="mt-[3px] text-sm-lo text-[var(--ds-text-muted-lo)]">
                {/* And the genitive: "a 340 punts d'Empresa", not "de
                    Empresa". */}
                {t('home.rank.behind', {
                  count: gap,
                  school: t(`escolaOf.${above.escola satisfies Escola}`),
                })}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="mt-6 text-md-lo text-fg-muted [text-wrap:pretty]">
        {t('home.rank.nudge')}{' '}
        <Link to="/ranquing" className="font-bold">
          {t('home.rank.link')}
        </Link>
      </p>

      {/* Sota el ganxo col·lectiu, el personal: qui fa un mes que no ve. */}
      <ComebackLine />
    </section>
  )
}

// ── last time ───────────────────────────────────────────────────────────────

function Recap({
  event,
  attendances,
  coverUrl,
}: {
  readonly event: EventRow
  readonly attendances: readonly AttendanceRow[]
  readonly coverUrl: string | null
}) {
  const { t } = useTranslation()
  const attended = attendances.filter(
    (r) => r.event_id === event.id && r.estado === 'asistio',
  ).length

  return (
    <section className={`pt-[22px] ${GUTTER}`}>
      <h2 className={`${EYEBROW_TIGHT} mb-6`}>{t('home.recap.title')}</h2>
      <div className="flex items-stretch gap-[14px]">
        {coverUrl === null ? (
          <div
            aria-hidden="true"
            className="size-[104px] flex-none rounded-sm bg-[var(--ds-bg-avatar)] bg-[image:var(--ds-pattern-avatar)]"
          />
        ) : (
          <img
            src={coverUrl}
            alt=""
            className="size-[104px] flex-none rounded-sm object-cover"
            decoding="async"
          />
        )}

        <div className="flex flex-1 flex-col justify-between">
          <div>
            <p className="text-xl leading-[1.15] font-bold [text-wrap:pretty]">
              {eventTitle(event.titulo)}
            </p>
            {attended > 0 ? (
              <p className="mt-[6px] text-md-lo text-fg-muted">
                {t('home.recap.were', { count: attended })}
              </p>
            ) : null}
          </div>
          <p className="flex items-baseline gap-4">
            <span className="tabular display text-3xl tracking-[-0.04em] text-brand-accent">
              +{event.puntos}
            </span>
            <span className="text-sm font-semibold text-fg-muted">{t('home.recap.points')}</span>
          </p>
        </div>
      </div>
    </section>
  )
}

// ── what else is coming ─────────────────────────────────────────────────────

function Upcoming({
  events,
  attendances,
  locale,
}: {
  readonly events: readonly EventRow[]
  readonly attendances: readonly AttendanceRow[]
  readonly locale: Locale
}) {
  const { t } = useTranslation()

  return (
    <section className={`pt-[26px] ${GUTTER}`}>
      <h2 className={`${EYEBROW_TIGHT} mb-2`}>{t('home.upcoming.title')}</h2>
      <ul>
        {events.map((event) => {
          const start = new Date(event.starts_at)
          const hidden = titleIsHidden(event.titulo)
          const left = placesLeft(event, goingRows(attendances, event.id).length)
          // Mateixa fila, tres diferències: el mes en violeta i no en vermell,
          // el dia com un interrogant, i on hi hauria les places hi ha quan es
          // sabrà. Les places d'una cosa que ningú no sap què és no diuen res.
          const days = hidden && event.reveal_at !== null ? daysUntil(new Date(event.reveal_at)) : null
          const sub = hidden
            ? days === null
              ? (event.teaser ?? '')
              : days <= 1
                ? t('event.teaser.willKnowInOne')
                : t('event.teaser.willKnowIn', { count: days })
            : [event.teaser, left === null ? null : t('units.placesLeft', { count: left })]
                .filter((part): part is string => part !== null && part !== '')
                .join(' · ')

          return (
            <li key={event.id} className="border-b border-surface-5">
              <Link
                to={`/esdeveniment/${event.id}`}
                className="flex items-center gap-[14px] py-[15px] no-underline"
              >
                <div className="w-[46px] flex-none text-center">
                  <p
                    className={
                      'text-2xs font-extrabold tracking-[0.1em] uppercase ' +
                      (hidden ? 'text-unknown' : 'text-brand-accent')
                    }
                  >
                    {formatMonthShort(start, locale)}
                  </p>
                  <p
                    className={
                      'tabular display text-d-sm leading-[0.9] tracking-[-0.04em] ' +
                      (hidden ? 'text-fg-muted' : '')
                    }
                  >
                    {hidden ? '?' : formatDayNumber(start, locale)}
                  </p>
                </div>
                <div className="flex-1">
                  <p
                    className={
                      'text-lg leading-[1.15] font-bold [text-wrap:pretty] ' +
                      (hidden ? 'tracking-[0.02em] text-fg-muted' : '')
                    }
                  >
                    {eventTitle(event.titulo)}
                  </p>
                  {sub === '' ? null : (
                    <p
                      className={
                        'mt-2 text-sm [text-wrap:pretty] ' +
                        (hidden ? 'font-bold text-unknown' : 'text-fg-muted')
                      }
                    >
                      {sub}
                    </p>
                  )}
                </div>
                <span aria-hidden="true" className="flex-none text-[20px] text-fg-faint">
                  ›
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      <p className="pt-8 pb-[10px] text-sm text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {events.length === 0 ? t('home.upcoming.none') : t('home.upcoming.thatIsAll')}
      </p>
    </section>
  )
}

/**
 * No events at all. Since a pending profile can now read the calendar, this
 * means what it says rather than "you are not allowed to see any of this".
 */
/**
 * La silueta del hero i de les places.
 *
 * Amb cobertura dolenta —el cas d'ús real— la primera impressió de cada nit
 * era una pantalla buida amb una paraula al mig. La silueta no és decoració:
 * diu que arriba una foto gran amb un títol a sota i unes places, i quan les
 * dades entren res no salta de lloc.
 */
function HeroSkeleton() {
  return (
    <Skeleton>
      <div className="relative h-[260px]">
        <SkeletonBar w="w-full" h="h-full" />
        <div className="absolute right-4 bottom-4 left-[var(--ds-gutter)]">
          <SkeletonBar w="w-[38%]" h="h-[11px]" className="bg-surface-6" />
          <SkeletonBar w="w-[80%]" h="h-[34px]" className="mt-4 bg-surface-6" />
        </div>
      </div>
      <div className={`flex items-end justify-between gap-[14px] pt-8 ${GUTTER}`}>
        <div className="min-w-0 flex-1">
          <SkeletonBar w="w-[55%]" h="h-[34px]" />
          <SkeletonBar w="w-[40%]" h="h-[11px]" className="mt-[5px]" />
        </div>
        <SkeletonBar w="w-[86px]" h="h-[30px]" className="flex-none rounded-full" />
      </div>
      <div className={`pt-8 ${GUTTER}`}>
        <SkeletonBar w="w-full" h="h-[56px]" />
      </div>
    </Skeleton>
  )
}

function NothingNext() {
  const { t } = useTranslation()
  return (
    <section className={`pt-10 ${GUTTER}`}>
      <p className="display text-d-sm [text-wrap:balance]">{t('home.empty.title')}</p>
      <p className="mt-3 text-fg-muted [text-wrap:pretty]">{t('home.empty.body')}</p>
    </section>
  )
}

function ErrorPanel({
  message,
  onRetry,
  label,
}: {
  readonly message: string
  readonly onRetry: () => void
  readonly label: string
}) {
  return (
    <div role="alert" className={`flex items-center justify-between gap-3 py-3 ${GUTTER}`}>
      <p className="text-sm text-error [text-wrap:pretty]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="-mr-3 min-h-[44px] flex-none px-3 text-sm font-bold text-brand-label"
      >
        {label}
      </button>
    </div>
  )
}
