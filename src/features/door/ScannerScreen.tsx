import { useQuery } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { env } from '@/config/env'
import { SCAN_PRESENTATION, toneVar } from '@/design/states'
import { fetchEvent } from '@/features/event/api'
import { eventKeys } from '@/features/event/api'

import { type DoorOutcome, doorKeys, fetchRoster, outcomeFromFailure, scan } from './api'
import { ScanGlyph } from './icons'
import { useCamera } from './useCamera'
import { useQueue } from './useQueue'

/**
 * The door.
 *
 * Everything on this screen is arranged around one fact: there is a queue
 * behind the person in front of you, and you get about half a second to read
 * the answer. So the verdict is a full-width card at thumb height with an icon,
 * a name at display size, and a buzz — and the camera never stops for it.
 *
 * A scan is written to an on-device queue before it is sent and cleared when it
 * lands. It is not a fallback after a failure: a request that hangs for thirty
 * seconds in a basement would be lost in between.
 */

const COOLDOWN_MS = 2200

export function ScannerScreen() {
  const { t } = useTranslation()
  const { eventId } = useParams()
  const id = eventId ?? ''

  const event = useQuery({
    queryKey: eventKeys.one(id),
    queryFn: () => fetchEvent(id),
    enabled: id !== '',
  })
  const roster = useQuery({
    queryKey: doorKeys.roster(id),
    queryFn: () => fetchRoster(id),
    enabled: id !== '',
    refetchInterval: 30_000,
  })

  const videoRef = useRef<HTMLVideoElement>(null)
  const [outcome, setOutcome] = useState<DoorOutcome | null>(null)
  const lastToken = useRef<{ value: string; at: number } | null>(null)
  const { queued, online, refresh: refreshQueue } = useQueue()

  // The same QR stays in front of the lens for a second or two after it is
  // read. Without this the card would flicker through four identical scans and
  // the person would not know whether they were in.
  const onCode = useCallback(
    (value: string) => {
      const now = Date.now()
      const previous = lastToken.current
      if (previous !== null && previous.value === value && now - previous.at < COOLDOWN_MS) return
      lastToken.current = { value, at: now }

      const request = {
        clientRequestId: crypto.randomUUID(),
        eventId: id,
        qrToken: value,
        userId: null,
      }

      void scan(request)
        .then((result) => {
          setOutcome({ kind: 'sent', result })
          buzz(SCAN_PRESENTATION[result.status].haptic)
          void roster.refetch()
        })
        .catch(() => {
          // Queued, not lost. The person walks in either way, so the card says
          // what actually happened rather than telling the junta to try again.
          setOutcome(outcomeFromFailure())
          buzz(SCAN_PRESENTATION.error.haptic)
        })
        .finally(refreshQueue)
    },
    [id, roster, refreshQueue],
  )

  const cameraError = useCamera(videoRef, onCode)

  const checkedIn = roster.data?.filter((r) => r.checked_in).length ?? 0
  const expected = roster.data?.filter((r) => r.estado === 'si' || r.checked_in).length ?? 0

  return (
    <main className="relative flex min-h-dvh flex-col bg-[var(--ds-bg-door)] text-fg">
      <video
        ref={videoRef}
        playsInline
        muted
        // Decorative: the verdict is announced by the card, not by the picture.
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover opacity-90"
      />
      <div aria-hidden="true" className="door-scrim absolute inset-0" />

      <header className="relative z-10 pt-[calc(var(--ds-safe-top)+8px)]">
        <div className="flex items-center justify-between gap-6 px-8">
          <Link
            to="/junta"
            aria-label={t('actions.close')}
            className="flex size-[56px] flex-none items-center justify-center rounded-full bg-[var(--ds-scrim-chip)] text-xl font-bold text-fg no-underline"
          >
            <span aria-hidden="true">✕</span>
          </Link>
          <div className="min-w-0 text-center">
            <p className="eyebrow text-brand-accent">{t('junta.title')}</p>
            <p className="truncate text-md font-bold">{event.data?.titulo ?? '…'}</p>
          </div>
          <span className="w-[44px] flex-none" />
        </div>

        <div className="mx-8 mt-6 flex items-center justify-between gap-6 rounded-[10px] bg-[var(--ds-scrim-chip)] px-7 py-5">
          <p className="text-md font-bold">
            {t('door.checkedIn', { count: checkedIn, total: expected })}
          </p>
          {queued > 0 || !online ? (
            <p className="flex items-center gap-3 text-sm font-bold text-[var(--ds-warning-deep)]">
              <span
                aria-hidden="true"
                className="size-[8px] flex-none animate-pulse rounded-full bg-[var(--ds-warning-deep)]"
              />
              {online
                ? t('door.queued', { count: queued })
                : t('door.queuedOffline', { count: queued })}
            </p>
          ) : null}
        </div>
      </header>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-12">
        {cameraError === null ? (
          <>
            <Reticle />
            <p className="mt-8 text-center text-sm text-fg-secondary [text-wrap:pretty]">
              {t('door.aim')}
            </p>
          </>
        ) : (
          <p className="max-w-[280px] text-center text-lg font-bold text-[var(--ds-warning)] [text-wrap:pretty]">
            {t(`door.camera.${cameraError}`)}
          </p>
        )}
      </div>

      {outcome === null ? null : <Verdict outcome={outcome} />}

      <footer className="relative z-10 border-t border-surface-5 bg-[var(--ds-scrim-bar)] px-8 pt-7 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] backdrop-blur-[14px]">
        <Link
          to={`/junta/alta/${id}`}
          className="flex min-h-[58px] w-full items-center justify-center bg-brand-cta px-9 py-8 text-xl font-bold text-on-brand no-underline [text-wrap:balance]"
        >
          {t('door.manual')}
        </Link>
        <div className="mt-5 flex items-center justify-between gap-6 text-[12.5px] text-fg-muted">
          <span className="flex-1 [text-wrap:pretty]">
            {env.entryPhoto ? t('door.photoOn') : t('door.photoOff')}
          </span>
          {typeof navigator.vibrate === 'function' ? (
            <span className="flex-none font-bold text-fg-secondary">{t('door.buzzes')}</span>
          ) : null}
        </div>
      </footer>
    </main>
  )
}

/** The four corners from the prototype. No box, so nothing hides the picture. */
function Reticle() {
  const corner = 'absolute size-[46px] border-fg'
  return (
    <div aria-hidden="true" className="relative size-[250px]">
      <span className={`${corner} top-0 left-0 rounded-tl-[8px] border-t-4 border-l-4`} />
      <span className={`${corner} top-0 right-0 rounded-tr-[8px] border-t-4 border-r-4`} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-[8px] border-b-4 border-l-4`} />
      <span className={`${corner} right-0 bottom-0 rounded-br-[8px] border-r-4 border-b-4`} />
    </div>
  )
}

function Verdict({ outcome }: { readonly outcome: DoorOutcome }) {
  const { t } = useTranslation()
  const shown = presentationOf(outcome)
  const tone = toneVar(shown.tone)
  const result = outcome.kind === 'sent' ? outcome.result : null

  const detail =
    result === null
      ? ''
      : [
          result.points_awarded !== undefined && result.points_awarded > 0
            ? t('units.points', { count: result.points_awarded })
            : null,
          result.pagado === false ? t('door.notPaid') : null,
          result.escola == null ? null : t(`escolaShort.${result.escola}`),
        ]
          .filter((s): s is string => s !== null)
          .join(' · ')

  return (
    <div
      role="status"
      aria-live="assertive"
      style={{ color: tone, borderColor: tone }}
      className="relative z-10 mx-8 mb-8 flex items-center gap-7 border-l-[5px] bg-[var(--ds-scrim-bar)] px-8 py-8 backdrop-blur-[14px]"
    >
      <ScanGlyph icon={shown.icon} />
      <div className="min-w-0 flex-1">
        <p className="display text-[27px] leading-none tracking-[-0.04em] [text-wrap:balance]">
          {result?.nombre ?? t('door.unknownPerson')}
        </p>
        <p className="mt-4 text-lg font-bold">{t(shown.messageKey)}</p>
        {detail === '' ? null : (
          <p className="mt-2 text-sm opacity-85 [text-wrap:pretty]">{detail}</p>
        )}
        {shown.actionKey === null ? null : (
          <p className="mt-2 text-sm text-fg-secondary [text-wrap:pretty]">{t(shown.actionKey)}</p>
        )}
      </div>
    </div>
  )
}

/**
 * A queued scan borrows the "in, but look at this later" presentation.
 *
 * It is not a success — nothing has been checked against the database yet —
 * and it is not a failure either, because the person is through the door.
 * `ok_walkin_review` already means exactly that, so it gets the same tick with
 * a mark beside it and the same double buzz.
 */
function presentationOf(outcome: DoorOutcome) {
  if (outcome.kind === 'sent') return SCAN_PRESENTATION[outcome.result.status]
  if (outcome.kind === 'queued') {
    return { ...SCAN_PRESENTATION.ok_walkin_review, messageKey: 'scanner.queued' }
  }
  return SCAN_PRESENTATION.error
}

function buzz(pattern: readonly number[]): void {
  // Absent on iOS Safari, which is most of the phones this runs on. The icon
  // and the card are the signal; the buzz is the bonus.
  if (typeof navigator.vibrate === 'function') navigator.vibrate([...pattern])
}
