import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InviteCodeSheet } from '@/features/session/InviteCodeSheet'
import { useMyProfile } from '@/features/session/useMyProfile'
import { useUserId } from '@/features/session/useUserId'
import type { Escola } from '@/lib/model'
import { useAvailability } from '@/lib/useAvailability'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { CARD, QrCard } from './QrCard'
import { qrQuery, readCachedToken } from './api'

/**
 * The door pass.
 *
 * Less is the whole design here: a big code, a big name under it, and nothing
 * competing with either. Somebody is holding this up in a queue, at night, to
 * a person who has ninety more to scan. The card itself lives in `QrCard`.
 */

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
    ...qrQuery(userId),
    enabled: !inactive,
    initialData: () => readCachedToken(userId) ?? undefined,
  })
  const view = useAvailability(token)

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
        view.unavailable ? (
          // Darrere hi ha cua física. Un carreró sense sortida aquí és
          // l'única pantalla de l'app on quedar-se encallat té gent esperant,
          // així que diu les dues sortides que hi ha: tornar-ho a provar, i
          // que l'alta manual existeix precisament per això.
          //
          // `view` i no `isError`: sense xarxa la consulta es posa en pausa en
          // lloc de fallar, i qui obria el QR per primer cop sota terra veia
          // la targeta grisa per sempre.
          <div className="flex flex-col items-center">
            <p role="alert" className="text-center text-fg-muted [text-wrap:pretty]">
              {t('qr.unavailable')}
            </p>
            <button
              type="button"
              onClick={view.retry}
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
          <QrCard token={token.data} name={profile?.nombre ?? ''} subtitle={subtitle} />

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
