import type { TFunction } from 'i18next'
import { type FormEvent, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { brand } from '@/config/brand'
import { env } from '@/config/env'
import { isStandalone } from '@/lib/platform'
import { supabase } from '@/lib/supabase'
import { Button } from '@/ui/Button/Button'
import { FieldShell, TextField } from '@/ui/Field/Field'
import { LogoMark, Wordmark } from '@/ui/Logo/Logo'

import { GoogleButton } from './GoogleButton'
import { looksStranded, signInWithGoogle } from './useGoogleSignIn'
import { INVITE_PARAM, useInvite } from './useInvite'

/**
 * The door.
 *
 * Two shapes of one screen. With a valid code in the link it is the layout the
 * junta approved: what this is, the code with its expiry, and one button.
 * Without one the invitation block goes and the button asks for access
 * instead — same layout, same order, and the person lands as 'pendent' for an
 * admin to approve.
 *
 * Google identifies people; it does not admit them. The gate is still the
 * invitation, redeemed by public.redeem_invite() once there is a session. An
 * email domain would let in all 3,500 students on the campus, and a Google
 * account would let in everybody with a Google account.
 *
 * Nobody types a name any more: Google returns it, and the trigger on
 * auth.users takes it from there.
 *
 * Signing in by email is still here, behind VITE_AUTH_EMAIL_FALLBACK. See
 * config/env.ts for when it comes back.
 */

type Phase =
  | { step: 'idle' }
  | { step: 'sending' }
  | { step: 'sent'; email: string }
  | { step: 'error'; messageKey: string }

function expiryLabel(expiresAt: Date | null, t: TFunction): string | null {
  if (!expiresAt) return null
  const ms = expiresAt.getTime() - Date.now()
  if (ms <= 0) return null

  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return t('entry.invite.expiresSoon')
  if (hours < 48) return t('entry.invite.expiresHours', { count: hours })
  return t('entry.invite.expiresDays', { count: Math.floor(hours / 24) })
}

export function EntryScreen() {
  const { t } = useTranslation()
  const invite = useInvite()
  const [phase, setPhase] = useState<Phase>({ step: 'idle' })
  const [email, setEmail] = useState('')
  const emailId = useId()
  const [stranded] = useState(() => looksStranded())

  const invited = invite.status === 'valid'
  const busy = phase.step === 'sending'
  const code = invite.status === 'valid' ? invite.code : null

  async function google() {
    if (busy) return
    setPhase({ step: 'sending' })
    const { error } = await signInWithGoogle(code)
    // On success the browser is already navigating away, so there is nothing
    // left to render. Only a failure comes back here.
    if (error) setPhase({ step: 'error', messageKey: 'entry.errors.googleFailed' })
  }

  async function sendEmail(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setPhase({ step: 'sending' })

    const redirect = new URL(window.location.origin)
    if (code !== null) redirect.searchParams.set(INVITE_PARAM, code)

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirect.toString(), shouldCreateUser: true },
    })

    if (error) {
      setPhase({ step: 'error', messageKey: 'entry.errors.sendFailed' })
      return
    }
    setPhase({ step: 'sent', email: email.trim() })
  }

  if (phase.step === 'sent') {
    return <SentPanel email={phase.email} onBack={() => setPhase({ step: 'idle' })} />
  }

  const expiry = invite.status === 'valid' ? expiryLabel(invite.expiresAt, t) : null

  return (
    <main className="flex min-h-dvh flex-col bg-app px-12 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
      <header className="mt-[26px] flex items-center gap-6">
        <LogoMark size={44} />
        <div>
          <Wordmark size={26} />
          <div className="mt-[5px] text-sm font-semibold tracking-[0.04em] text-[var(--ds-text-muted-lo)]">
            {brand.tagline}
          </div>
        </div>
      </header>

      {/* Top-aligned, as drawn. Pushed to the bottom it sits nicely under a
          thumb on a tall phone, and on a short one the title goes off the top
          — and the title is the whole message. */}
      <div className="mt-24">
        <h1 className="font-display text-d-lg leading-[0.87] tracking-[-0.05em] uppercase">
          {invited ? t('entry.invited.title') : t('entry.open.title')}
        </h1>
        <p className="mt-8 max-w-[300px] text-lg text-fg-secondary [text-wrap:pretty]">
          {invited ? t('entry.invited.lede') : t('entry.open.lede')}
        </p>

        {/* Back in an installed app with no session: the round trip ended
            somewhere else. Amber, never the brand red. */}
        {stranded && (
          <p
            role="status"
            className="mt-[26px] border-l-[3px] border-warning bg-surface-1 px-[18px] py-[15px] text-md text-fg-secondary [text-wrap:pretty]"
          >
            {t('entry.stranded')}
          </p>
        )}

        {/* The same block in both states, so the door has one shape. With a
            code it holds the code; without one it holds the absence of one,
            dashed, and says who resolves it. An empty space there would just
            read as a screen that had not finished loading. */}
        <div className="mt-[26px]">
          {invite.status === 'valid' ? (
            <FieldShell
              label={t('entry.invite.label')}
              aside={
                expiry ? (
                  <span className="max-w-[96px] text-right text-[12.5px] font-bold text-warning [text-wrap:pretty]">
                    {expiry}
                  </span>
                ) : null
              }
            >
              <div className="mt-[5px] font-display text-[25px] tracking-[0.02em]">
                {invite.code}
              </div>
            </FieldShell>
          ) : (
            <FieldShell
              variant="dashed"
              label={t('entry.open.noCodeLabel')}
              aside={
                <span className="max-w-[104px] text-right text-[12.5px] font-bold text-fg-muted [text-wrap:pretty]">
                  {t('entry.open.noCodeAside')}
                </span>
              }
            >
              <div className="mt-[5px] font-display text-[25px] tracking-[-0.02em] text-fg-faint">
                {t('entry.open.noCodeValue')}
              </div>
            </FieldShell>
          )}
        </div>

        <div className="mt-9">
          <GoogleButton onClick={() => void google()} disabled={busy}>
            {busy ? t('entry.sending') : invited ? t('entry.invited.cta') : t('entry.open.cta')}
          </GoogleButton>
        </div>

        {phase.step === 'error' && (
          <p role="alert" className="mt-3 text-md font-bold text-error [text-wrap:pretty]">
            {t(phase.messageKey)}
          </p>
        )}

        <p className="mt-6 text-sm text-fg-muted [text-wrap:pretty]">
          {invited ? t('entry.invited.reassurance') : t('entry.open.reassurance')}
        </p>

        {env.authEmailFallback && (
          <form
            className="mt-[26px] border-t border-border pt-[18px]"
            onSubmit={(e) => void sendEmail(e)}
            noValidate
          >
            <p className="text-sm text-fg-muted [text-wrap:pretty]">{t('entry.emailFallback')}</p>
            <div className="mt-3">
              <TextField
                id={emailId}
                label={t('entry.email.label')}
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="go"
                required
                placeholder={t('entry.email.placeholder')}
              />
            </div>
            <div className="mt-4">
              <Button type="submit" variant="secondary" disabled={busy}>
                {t('entry.emailCta')}
              </Button>
            </div>
          </form>
        )}

        {/* With a code, where to get another one. Without one, what to do if
            you actually have one and arrived here by typing the address. The
            second is emphasis and not a link: there is nowhere for it to go
            but the invitation in their own messages. */}
        {invited ? (
          <p className="mt-[18px] text-md font-bold [text-wrap:pretty]">
            {t('entry.noInvite.question')}{' '}
            <a
              href={env.whatsappUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-brand-label underline-offset-2 hover:underline"
            >
              {t('entry.noInvite.link')}
            </a>
          </p>
        ) : (
          <p className="mt-[18px] text-md font-bold [text-wrap:pretty]">
            {t('entry.hasCode.question')}{' '}
            <span className="text-brand-label">{t('entry.hasCode.hint')}</span>
          </p>
        )}
      </div>
    </main>
  )
}

interface SentPanelProps {
  readonly email: string
  readonly onBack: () => void
}

/**
 * "Check your email", for the fallback path only.
 *
 * The order of the two options flips by context. From a home-screen app the
 * link is the wrong advice — tapping it in Mail opens Safari, the session
 * lands there, and the icon is still signed out — so the code leads. In Safari
 * the link works, so it leads.
 */
function SentPanel({ email, onBack }: SentPanelProps) {
  const { t } = useTranslation()
  const [token, setToken] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const codeId = useId()
  const standalone = isStandalone()

  async function verify(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFailed(false)

    const { error } = await supabase.auth.verifyOtp({ email, token: token.trim(), type: 'email' })

    setBusy(false)
    if (error) setFailed(true)
  }

  const codeForm = (
    <form onSubmit={(e) => void verify(e)} noValidate>
      <TextField
        id={codeId}
        label={t('entry.sent.codeLabel')}
        value={token}
        onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        enterKeyHint="go"
        placeholder="000000"
      />
      <div className="mt-4">
        <Button type="submit" disabled={busy || token.length < 6}>
          {busy ? t('entry.sent.verifying') : t('entry.sent.verify')}
        </Button>
      </div>
      {failed && (
        <p role="alert" className="mt-3 text-md font-bold text-error [text-wrap:pretty]">
          {t('entry.errors.badCode')}
        </p>
      )}
    </form>
  )

  return (
    <main className="flex min-h-dvh flex-col bg-app px-12 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
      <div className="mt-auto">
        <h1 className="font-display text-d-lg leading-[0.87] tracking-[-0.05em] uppercase">
          {t('entry.sent.title')}
        </h1>
        <p className="mt-4 text-lg text-fg-secondary [text-wrap:pretty]">
          {t('entry.sent.lede', { email })}
        </p>

        <div className="mt-[26px] flex flex-col gap-[14px]">
          {standalone ? (
            <>
              {codeForm}
              <p className="text-sm text-fg-muted [text-wrap:pretty]">
                {t('entry.sent.linkOpensSafari')}
              </p>
            </>
          ) : (
            <>
              <p className="text-lg text-fg-secondary [text-wrap:pretty]">{t('entry.sent.link')}</p>
              <p className="text-sm text-fg-muted [text-wrap:pretty]">{t('entry.sent.orCode')}</p>
              {codeForm}
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onBack}
          className="mt-[18px] cursor-pointer border-0 bg-transparent p-0 text-md font-bold text-brand-label"
        >
          {t('entry.sent.back')}
        </button>
      </div>
    </main>
  )
}
