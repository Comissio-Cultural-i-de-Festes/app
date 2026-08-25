import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type Card, drawCard } from '@/lib/cards'
import { cardFilename, canShareFiles, shareCard } from '@/lib/share'

/**
 * The button that makes a card and hands it over.
 *
 * Four screens use it and none of them draws anything until it is pressed: a
 * 1080×1920 canvas plus a font load is not something to do on the off chance,
 * on a phone, while somebody is reading.
 *
 * The label is the confirmation, the way `EventScreen`'s share button already
 * works — 2500 ms and no toast. And it tells the truth about which of the two
 * things it is going to do: on a phone that cannot share files it says «desa-la
 * al carret» from the start rather than promising a share sheet and producing a
 * download.
 *
 * Nothing is published by anybody but the person pressing it. That is worth
 * saying out loud because it is the difference between this and every other
 * app that offers to post on your behalf.
 */

const CONFIRM_MS = 2500

type State = 'idle' | 'working' | 'shared' | 'saved' | 'failed'

export function ShareCard({
  card,
  name,
  text,
  variant = 'solid',
}: {
  /** Built on demand: photographs are fetched and a canvas is drawn. */
  readonly card: () => Promise<Card>
  /** Parts of the filename somebody will see in their photo roll. */
  readonly name: readonly string[]
  readonly text?: string
  readonly variant?: 'solid' | 'quiet'
}) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>('idle')
  // Whether this phone can take a file at all, decided before the first press
  // so the button says the right thing from the start. Asked once, with a real
  // PNG: `canShare` inspects the payload and a plain object gets a false no.
  const [canShare] = useState(() =>
    canShareFiles(
      new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
      'probe.png',
    ),
  )
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  const settle = (next: State) => {
    setState(next)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setState('idle')
    }, CONFIRM_MS)
  }

  const press = async () => {
    setState('working')
    try {
      const blob = await drawCard(await card())
      const outcome = await shareCard(blob, cardFilename(name), text)
      // Cancelling is not a failure and not a success: the sheet opened and the
      // person closed it. Straight back to the button they pressed.
      if (outcome === 'cancelled') setState('idle')
      else settle(outcome === 'shared' ? 'shared' : outcome === 'saved' ? 'saved' : 'failed')
    } catch {
      settle('failed')
    }
  }

  const label =
    state === 'working'
      ? t('share.making')
      : state === 'shared'
        ? t('share.shared')
        : state === 'saved'
          ? t('share.saved')
          : state === 'failed'
            ? t('share.failed')
            : canShare
              ? t('share.card')
              : t('share.download')

  const solid = variant === 'solid'

  return (
    <>
      <button
        type="button"
        disabled={state === 'working'}
        onClick={() => {
          void press()
        }}
        className={
          solid
            ? 'flex min-h-[58px] w-full items-center justify-center gap-6 bg-brand-cta px-8 py-7 text-lg font-bold text-on-brand [text-wrap:balance] disabled:opacity-60'
            : 'flex min-h-[58px] w-full items-center justify-center gap-6 border border-surface-8 bg-surface-2 px-8 py-7 text-md font-bold text-fg [text-wrap:balance] disabled:opacity-60'
        }
      >
        <UpArrow down={!canShare} />
        {label}
      </button>
      <p className="mt-5 text-sm-lo text-fg-muted [text-wrap:pretty]">
        {canShare ? t('share.nothingAuto') : t('share.downloadNote')}
      </p>
    </>
  )
}

/** The drawings' own glyph: out of the phone, or down into it. */
function UpArrow({ down }: { readonly down: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="flex-none">
      <path d="M10 2.5v11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d={down ? 'M5.5 9 10 13.5 14.5 9' : 'M5.5 7 10 2.5 14.5 7'}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 12.5v4a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
