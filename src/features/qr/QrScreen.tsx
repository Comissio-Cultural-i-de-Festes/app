import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMyProfile } from '@/features/session/useMyProfile'
import { useUserId } from '@/features/session/useUserId'
import type { Escola } from '@/lib/model'

import { fetchQrToken, qrKeys, readCachedToken } from './api'

/**
 * The door pass.
 *
 * Less is the whole design here: a big code, a big name under it, and nothing
 * competing with either. Somebody is holding this up in a queue, at night, to
 * a person who has ninety more to scan.
 *
 * White card on a dark app on purpose. Scanners read dark-on-light far more
 * reliably, and inverting a QR is the kind of clever that costs you a second
 * per person at the door.
 */

const CARD = 340
const CODE = 300

export function QrScreen() {
  const { t } = useTranslation()
  const userId = useUserId()
  const { data: profile } = useMyProfile()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawError, setDrawError] = useState(false)

  // A profile that is not active has no door token and cannot get one — the
  // door would turn them away anyway. Known BEFORE the request, so the screen
  // says the true thing instead of asking the server a question whose NULL
  // answer is indistinguishable from a request that never arrived.
  //
  // Only when the profile has actually loaded. Offline it has not, and offline
  // is exactly when the cached token below has to win.
  const inactive = profile !== undefined && profile !== null && profile.estat !== 'actiu'

  const token = useQuery({
    queryKey: qrKeys.mine(userId),
    queryFn: () => fetchQrToken(userId),
    enabled: !inactive,
    // The token does not change unless somebody rotates it, and this screen is
    // opened in exactly the places with the worst signal.
    staleTime: 24 * 60 * 60 * 1000,
    initialData: () => readCachedToken(userId) ?? undefined,
    retry: 1,
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || token.data === undefined) return

    void QRCode.toCanvas(canvas, token.data, {
      width: CODE,
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    }).then(
      () => {
        setDrawError(false)
      },
      () => {
        setDrawError(true)
      },
    )
  }, [token.data])

  // Keeps the screen from dimming while it is being shown. There is no way to
  // raise the brightness from a web page — the line below asks the person to
  // do that — but there is a way to stop the phone deciding, thirty seconds
  // into a queue, that nobody is looking at it.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    let cancelled = false

    void navigator.wakeLock?.request('screen').then(
      (sentinel) => {
        if (cancelled) void sentinel.release()
        else lock = sentinel
      },
      () => {
        /* denied, or the tab is not visible. Nothing depends on it. */
      },
    )

    return () => {
      cancelled = true
      void lock?.release()
    }
  }, [])

  const subtitle = [
    profile?.escola === null || profile?.escola === undefined
      ? null
      : t(`escolaShort.${profile.escola satisfies Escola}`),
    profile?.curs === null || profile?.curs === undefined
      ? null
      : t(`onboarding.year.${String(profile.curs)}`),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')

  if (inactive) {
    return (
      <main className="with-tabbar flex min-h-dvh flex-col items-center justify-center gap-6 bg-app px-12 pt-[var(--ds-safe-top)]">
        <h1 className="display text-center text-d-s tracking-[-0.045em] [text-wrap:balance]">
          {t('qr.notYet.title')}
        </h1>
        <p className="text-center text-md text-fg-secondary [text-wrap:pretty]">
          {profile?.estat === 'pendent' ? t('qr.notYet.pending') : t('qr.notYet.left')}
        </p>
      </main>
    )
  }

  return (
    <main className="with-tabbar flex min-h-dvh flex-col items-center justify-center bg-app px-10 pt-[var(--ds-safe-top)]">
      {token.data === undefined ? (
        <p className="text-center text-fg-muted [text-wrap:pretty]">
          {token.isError ? t('qr.unavailable') : t('state.loading')}
        </p>
      ) : (
        <>
          <div
            className="flex flex-col items-center rounded-lg bg-white p-10"
            style={{ width: CARD }}
          >
            {drawError ? (
              <p
                role="alert"
                className="flex h-[300px] w-[300px] items-center justify-center text-center text-md text-[oklch(0.42_0.012_45)] [text-wrap:pretty]"
              >
                {t('qr.unavailable')}
              </p>
            ) : (
              <canvas
                ref={canvasRef}
                width={CODE}
                height={CODE}
                aria-label={t('qr.codeLabel')}
                role="img"
              />
            )}

            <p className="display mt-9 text-center text-[28px] tracking-[-0.04em] text-[oklch(0.18_0.012_25)]">
              {profile?.nombre ?? ''}
            </p>
            {subtitle === '' ? null : (
              <p className="mt-3 text-center text-md font-semibold text-[oklch(0.42_0.012_45)]">
                {subtitle}
              </p>
            )}
          </div>

          <p className="mt-[22px] flex items-center gap-[9px] rounded-md bg-surface-2 px-[14px] py-[9px]">
            <span aria-hidden="true" className="size-2 flex-none rounded-full bg-success" />
            <span className="text-sm font-semibold text-fg-secondary">{t('qr.offlineOk')}</span>
          </p>

          <p className="mt-[14px] max-w-[300px] text-center text-md text-fg-muted [text-wrap:pretty]">
            {t('qr.howTo')}
          </p>
        </>
      )}
    </main>
  )
}
