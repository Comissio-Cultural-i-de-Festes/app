import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { androidChromeIntent, isAndroid } from '@/lib/platform'
import { Button, ButtonLink } from '@/ui/Button/Button'
import { Notice } from '@/ui/Notice/Notice'

/**
 * What the door says, instead of Google's button, inside another app's browser.
 *
 * The link is the page as it is right now, query and all: the invitation code
 * rides in `?codi=`, and a copy that lost it would send somebody to the "ask
 * for access" door they were invited past. The hash goes, because nothing here
 * reads it and an intent URL cannot carry one.
 *
 * Android gets a button that asks for Chrome. iOS has no equivalent that works
 * — a `x-safari-https://` scheme is dead in the current webviews — so there the
 * words and the copy button do the job, and the copy button has to prove it
 * worked: the label turns into the confirmation, and when the clipboard is
 * refused the link is put on screen in a field that selects itself, which is
 * the one fallback that cannot fail.
 */

function currentLink(): string {
  const url = new URL(window.location.href)
  url.hash = ''
  return url.toString()
}

export function InAppBrowserNotice({ className = '' }: { readonly className?: string }) {
  const { t } = useTranslation()
  const link = currentLink()
  const android = isAndroid()
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function copyLink(): Promise<void> {
    clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(link)
      setCopy('copied')
      timer.current = setTimeout(() => {
        setCopy('idle')
      }, 2500)
    } catch {
      // Refused, or no clipboard API in this webview. Not retried: the link
      // is on screen now.
      setCopy('failed')
    }
  }

  return (
    <div className={className}>
      <Notice as="div" size="default">
        <h2 className="text-lg font-bold text-fg">{t('entry.inApp.title')}</h2>
        <p className="mt-3 text-md text-fg-secondary [text-wrap:pretty]">{t('entry.inApp.body')}</p>
        {!android && (
          <p className="mt-3 text-md text-fg-secondary [text-wrap:pretty]">
            {t('entry.inApp.ios')}
          </p>
        )}
      </Notice>

      <div className="mt-6 flex flex-col gap-[10px]">
        {android && (
          <>
            <ButtonLink href={androidChromeIntent(link)} size="lg">
              {t('entry.inApp.androidCta')}
            </ButtonLink>
            <p className="text-sm text-fg-muted [text-wrap:pretty]">
              {t('entry.inApp.androidHint')}
            </p>
          </>
        )}
        <Button
          type="button"
          size="lg"
          variant={android ? 'secondary' : 'primary'}
          onClick={() => void copyLink()}
        >
          {copy === 'copied' ? t('entry.inApp.copied') : t('entry.inApp.copy')}
        </Button>
      </div>

      <p role="status" className="sr-only">
        {copy === 'copied' ? t('entry.inApp.copied') : ''}
      </p>

      {copy === 'failed' && (
        <div className="mt-3">
          <p role="alert" className="text-md font-bold text-error [text-wrap:pretty]">
            {t('entry.inApp.copyFailed')}
          </p>
          <input
            readOnly
            value={link}
            aria-label={t('entry.inApp.linkLabel')}
            onFocus={(e) => {
              e.currentTarget.select()
            }}
            className="mt-3 min-h-[44px] w-full border-[1.5px] border-[var(--ds-border-input)] bg-surface-1 px-7 text-md text-fg"
          />
        </div>
      )}
    </div>
  )
}
