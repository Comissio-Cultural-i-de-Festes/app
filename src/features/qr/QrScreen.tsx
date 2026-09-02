import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InviteCodeSheet } from '@/features/session/InviteCodeSheet'
import { useMyProfile } from '@/features/session/useMyProfile'
import { useUserId } from '@/features/session/useUserId'
import type { Escola } from '@/lib/model'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

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

/** La targeta blanca, la mateixa mida, mentre el codi arriba. */
function QrSkeleton() {
  return (
    <Skeleton className="flex flex-col items-center">
      <div
        className="flex flex-col items-center rounded-lg bg-surface-2 p-10"
        style={{ width: CARD }}
      >
        <SkeletonBar w="w-[300px]" h="h-[300px]" />
        <SkeletonBar w="w-[55%]" h="h-[24px]" className="mt-9" />
        <SkeletonBar w="w-[38%]" h="h-[12px]" className="mt-3" />
      </div>
      <SkeletonBar w="w-[180px]" h="h-[30px]" className="mt-[22px] rounded-md" />
    </Skeleton>
  )
}

export function QrScreen() {
  const { t } = useTranslation()
  const userId = useUserId()
  const { data: profile } = useMyProfile()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawError, setDrawError] = useState(false)
  const [asking, setAsking] = useState(false)

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

  // La banda de dalt diu l'estat; això diu la conseqüència. Són dues meitats
  // de la mateixa frase i per això la sortida —el codi d'invitació— surt als
  // dos llocs: qui arriba aquí buscant el QR no ha de tornar amunt a buscar-la.
  //
  // El quadre discontinu manté la forma de la pantalla: un buit centrat sense
  // res es llegeix com una targeta que no ha acabat de carregar, que és
  // exactament el dubte que aquí no toca.
  if (inactive) {
    const pending = profile?.estat === 'pendent'

    return (
      <main className="with-tabbar flex min-h-dvh flex-col items-center bg-app px-[var(--ds-gutter)] pt-[calc(var(--ds-safe-top-min)+28px)] pb-10">
        {/* El centrat va aquí i no al `main`: el full és `fixed` però continua
            sent descendent al DOM, i `text-align` s'hereta —amb el centrat a
            dalt, l'etiqueta i el camp del codi sortien centrats. */}
        <div className="w-full text-center">
          <h1 className="display text-d-s tracking-[-0.045em] [text-wrap:balance]">
            {t('qr.notYet.heading')}
          </h1>
          <p className="mt-6 text-md text-fg-muted [text-wrap:pretty]">{t('qr.notYet.lead')}</p>

          <div className="mx-auto mt-[28px] grid size-[240px] place-items-center border-[1.5px] border-dashed border-[var(--ds-border-input)] bg-surface-1 p-10">
            <div>
              <p className="display text-d-xs leading-[1.05] tracking-[-0.04em] text-fg-muted [text-wrap:balance]">
                {t('qr.notYet.title')}
              </p>
              <p className="mt-5 text-sm leading-[1.4] text-fg-muted-lo [text-wrap:pretty]">
                {pending ? t('qr.notYet.pending') : t('qr.notYet.left')}
              </p>
            </div>
          </div>

          {/* Només per a qui està pendent. A algú que ha plegat, un codi
              d'invitació no li resol res: aquella conversa és amb la junta i
              no amb un camp de text. */}
          {pending ? (
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="mt-[24px] flex min-h-[48px] w-full items-center justify-center border-[1.5px] border-border-strong bg-surface-2 px-7 py-6 text-base font-bold text-fg [text-wrap:balance]"
            >
              {t('pending.haveCode')}
            </button>
          ) : null}
        </div>

        {asking ? (
          <InviteCodeSheet
            onClose={() => {
              setAsking(false)
            }}
          />
        ) : null}
      </main>
    )
  }

  return (
    <main className="with-tabbar flex min-h-dvh flex-col items-center justify-center bg-app px-10 pt-[var(--ds-safe-top-min)]">
      {token.data === undefined ? (
        token.isError ? (
          // Darrere hi ha cua física. Un carreró sense sortida aquí és
          // l'única pantalla de l'app on quedar-se encallat té gent esperant,
          // així que diu les dues sortides que hi ha: tornar-ho a provar, i
          // que l'alta manual existeix precisament per això.
          <div className="flex flex-col items-center">
            <p role="alert" className="text-center text-fg-muted [text-wrap:pretty]">
              {t('qr.unavailable')}
            </p>
            <button
              type="button"
              onClick={() => void token.refetch()}
              className="mt-6 inline-flex min-h-[44px] items-center px-2 text-md font-bold text-brand-label"
            >
              {t('actions.retry')}
            </button>
            <p className="mt-2 max-w-[300px] text-center text-md text-fg-muted [text-wrap:pretty]">
              {t('qr.fallback')}
            </p>
          </div>
        ) : (
          <QrSkeleton />
        )
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

            <p className="display mt-9 text-center text-d-sm tracking-[-0.04em] text-[oklch(0.18_0.012_25)]">
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
