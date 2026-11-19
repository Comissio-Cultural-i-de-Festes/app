import type { TFunction } from 'i18next'
import { type FormEvent, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LegalLinks } from '@/features/legal/LegalLinks'
import { brand } from '@/config/brand'
import { env } from '@/config/env'
import { inAppBrowser, isStandalone } from '@/lib/platform'
import { supabase } from '@/lib/supabase'
import { Button } from '@/ui/Button/Button'
import { FieldShell, TextField } from '@/ui/Field/Field'
import { LogoMark, Wordmark } from '@/ui/Logo/Logo'
import { Notice } from '@/ui/Notice/Notice'

import { GoogleButton } from './GoogleButton'
import { InAppBrowserNotice } from './InAppBrowserNotice'
import { rememberReturn } from './returnTo'
import { looksStranded, signInWithGoogle } from './useGoogleSignIn'
import { INVITE_PARAM, readInviteCode, useInvite } from './useInvite'

/**
 * The door.
 *
 * Two shapes of one screen. With a valid code in the link it is the layout the
 * junta approved: what this is, the code with its expiry, and one button.
 * Without one the invitation block goes and the button asks for access
 * instead — same layout, same order, and the person lands as 'pendent' for an
 * admin to approve.
 *
 * The code in the link travels to Google whatever the check said. The check
 * only chooses the face of the door; `redeem_invite` decides, and a bad code
 * there costs nothing but an `ok: false`. Holding it back until the check
 * answered meant that a tap during a slow check —the first thing an iPhone
 * sees now that the door comes before the install— came back pending.
 *
 * A third face, from the home-screen icon with no code: the icon opens `/` and
 * never carries one, and whoever is there may well have come in through the
 * browser with an invitation already —on an iPhone or an Android alike—.
 * "Ask for access" would be telling an active member the junta still has to
 * let them in, so the door says both things without guessing which.
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
  const [inApp] = useState(() => inAppBrowser() !== null)

  const [code] = useState(() => readInviteCode())
  const [fromIcon] = useState(() => code === null && isStandalone())

  // Mentre es comprova, o si la comprovació no ha arribat, la porta és la de
  // la invitació: el codi hi és, i res no diu que no valgui.
  const invited = code !== null && invite.status !== 'invalid'
  const busy = phase.step === 'sending'

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
    rememberReturn(window.location.pathname)

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
    <main className="flex min-h-dvh flex-col bg-app px-[var(--ds-gutter)] pt-[var(--ds-safe-top-min)] pb-[calc(var(--ds-safe-bottom)+24px)]">
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
          {invited
            ? t('entry.invited.title')
            : fromIcon
              ? t('entry.app.title')
              : t('entry.open.title')}
        </h1>
        <p className="mt-8 max-w-[300px] text-lg text-fg-secondary [text-wrap:pretty]">
          {inApp
            ? invited
              ? t('entry.inApp.ledeInvited')
              : t('entry.inApp.ledeOpen')
            : invited
              ? t('entry.invited.lede')
              : fromIcon
                ? t('entry.app.lede')
                : t('entry.open.lede')}
        </p>

        {/* Right after the lede, ahead of every other notice and the code
            card: on a small phone with a valid invitation, anything above it
            pushes the only thing to tap below the fold. Google refuses to sign
            in from another app's browser, so its button would only lead to a
            403, and this replaces it. */}
        {inApp && <InAppBrowserNotice className="mt-[26px]" />}

        {/* Back in an installed app with no session: the round trip ended
            somewhere else. Amber, never the brand red. */}
        {stranded && <Notice className="mt-[26px]">{t('entry.stranded')}</Notice>}

        {/* Portava un codi i no val. La pantalla és la de «demana accés» —el
            camí de sortida és el mateix— però dient-ho, que és el que faltava:
            sense aquesta línia, qui arriba amb l'enllaç de la setmana passada
            entra, queda pendent, i no sap que el seu codi ha fallat. El motiu
            no es diu perquè el servidor no el diu. */}
        {invite.status === 'invalid' && (
          <Notice className="mt-[26px]">{t('entry.invite.stale')}</Notice>
        )}

        {/* The same block in both states, so the door has one shape. With a
            code it holds the code; without one it holds the absence of one,
            dashed, and says who resolves it. An empty space there would just
            read as a screen that had not finished loading. */}
        {/* Des de la icona, el bloc del «cap codi · ho aprova la junta» no hi va:
            qui hi és sol ser algú que ja ha entrat amb una invitació. */}
        {fromIcon ? null : (
          <div className="mt-[26px]">
            {invited ? (
              <FieldShell
                label={t('entry.invite.label')}
                aside={
                  expiry ? (
                    <span className="max-w-[96px] text-right text-sm-lo font-bold text-warning [text-wrap:pretty]">
                      {expiry}
                    </span>
                  ) : null
                }
              >
                <div className="mt-[5px] font-display text-d-sm tracking-[0.02em]">{code}</div>
              </FieldShell>
            ) : (
              <FieldShell
                variant="dashed"
                label={t('entry.open.noCodeLabel')}
                aside={
                  <span className="max-w-[104px] text-right text-sm-lo font-bold text-fg-muted [text-wrap:pretty]">
                    {t('entry.open.noCodeAside')}
                  </span>
                }
              >
                <div className="mt-[5px] font-display text-d-sm tracking-[-0.02em] text-fg-faint">
                  {t('entry.open.noCodeValue')}
                </div>
              </FieldShell>
            )}
          </div>
        )}

        {!inApp && (
          <div className="mt-9">
            <GoogleButton onClick={() => void google()} disabled={busy}>
              {busy ? t('entry.sending') : invited ? t('entry.invited.cta') : t('entry.open.cta')}
            </GoogleButton>
          </div>
        )}

        {phase.step === 'error' && (
          <p role="alert" className="mt-3 text-md font-bold text-error [text-wrap:pretty]">
            {t(phase.messageKey)}
          </p>
        )}

        {!inApp && (
          <p className="mt-6 text-sm text-fg-muted [text-wrap:pretty]">
            {invited
              ? t('entry.invited.reassurance')
              : fromIcon
                ? t('entry.app.reassurance')
                : t('entry.open.reassurance')}
          </p>
        )}

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
            <span className="text-brand-label">
              {fromIcon ? t('entry.app.hasCodeHint') : t('entry.hasCode.hint')}
            </span>
          </p>
        )}

        {/* A la porta, que és on encara es pot dir que no. */}
        <LegalLinks className="mt-8" />
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
    <main className="flex min-h-dvh flex-col bg-app px-[var(--ds-gutter)] pt-[var(--ds-safe-top-min)] pb-[calc(var(--ds-safe-bottom)+24px)]">
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
          className="mt-[18px] -ml-2 inline-flex min-h-[44px] cursor-pointer items-center border-0 bg-transparent px-2 text-md font-bold text-brand-label"
        >
          {t('entry.sent.back')}
        </button>
      </div>
    </main>
  )
}
