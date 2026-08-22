import type { TFunction } from 'i18next'
import { type FormEvent, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { brand } from '@/config/brand'
import { env } from '@/config/env'
import { isStandalone } from '@/lib/platform'
import { supabase } from '@/lib/supabase'
import { Button } from '@/ui/Button/Button'
import { FieldShell, TextField } from '@/ui/Field/Field'

import { INVITE_PARAM, useInvite } from './useInvite'

/**
 * The door.
 *
 * Two shapes of the same screen. With a valid code in the link it is the
 * layout the junta approved: who invited you, what this is, the code with its
 * expiry, and ENTRA. Without one, the invitation block becomes a name field
 * and the button asks for access instead — same layout, same order, and the
 * person ends up as 'pendent' for an admin to approve.
 *
 * The email field is free. The gate is the invitation, not the domain: a
 * campus address would let in all 3,500 students.
 */

type Phase =
  | { step: 'form' }
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
  const [phase, setPhase] = useState<Phase>({ step: 'form' })
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const emailId = useId()
  const nameId = useId()

  const invited = invite.status === 'valid'
  const busy = phase.step === 'sending'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setPhase({ step: 'sending' })

    // Carry the code through the round trip so it can be redeemed once a
    // session exists, even if the link is opened on another device.
    const redirect = new URL(window.location.origin)
    if (invite.status === 'valid') redirect.searchParams.set(INVITE_PARAM, invite.code)

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirect.toString(),
        shouldCreateUser: true,
        // The trigger on auth.users reads `nombre` and ignores everything
        // else in here — role and estat are literals in the trigger, because
        // this object is entirely client-controlled.
        ...(invited ? {} : { data: { nombre: nombre.trim() } }),
      },
    })

    if (error) {
      setPhase({ step: 'error', messageKey: 'entry.errors.sendFailed' })
      return
    }
    setPhase({ step: 'sent', email: email.trim() })
  }

  if (phase.step === 'sent') {
    return <SentPanel email={phase.email} onBack={() => setPhase({ step: 'form' })} />
  }

  const expiry = invite.status === 'valid' ? expiryLabel(invite.expiresAt, t) : null

  return (
    <main
      className={
        'flex min-h-dvh flex-col bg-app px-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]'
      }
    >
      <header className="mt-[26px]">
        <div className="font-display text-3xl tracking-[-0.04em] text-brand-strong uppercase">
          {brand.shortName}
        </div>
        <div className="mt-1 text-sm font-semibold tracking-[0.04em] text-[var(--ds-text-muted-lo)]">
          {brand.tagline}
        </div>
      </header>

      <form className="mt-auto" onSubmit={(e) => void submit(e)} noValidate>
        <h1 className="font-display text-d-lg leading-[0.87] tracking-[-0.05em] uppercase">
          {invited ? t('entry.invited.title') : t('entry.open.title')}
        </h1>
        <p className="mt-4 max-w-[300px] text-lg text-fg-secondary [text-wrap:pretty]">
          {invited ? t('entry.invited.lede') : t('entry.open.lede')}
        </p>

        <div className="mt-[26px]">
          {invite.status === 'valid' ? (
            <FieldShell
              label={t('entry.invite.label')}
              aside={
                expiry ? (
                  // Amber, never the brand red. Red here is the association,
                  // not a warning.
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
            <TextField
              id={nameId}
              label={t('entry.name.label')}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoComplete="name"
              enterKeyHint="next"
              required
              placeholder={t('entry.name.placeholder')}
            />
          )}
        </div>

        <div className="mt-[14px]">
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
          <Button type="submit" size="hero" disabled={busy}>
            {busy ? t('entry.sending') : invited ? t('entry.invited.cta') : t('entry.open.cta')}
          </Button>
        </div>

        {phase.step === 'error' && (
          <p role="alert" className="mt-3 text-md font-bold text-error [text-wrap:pretty]">
            {t(phase.messageKey)}
          </p>
        )}

        <p className="mt-3 text-sm text-fg-muted [text-wrap:pretty]">
          {invited ? t('entry.invited.reassurance') : t('entry.open.reassurance')}
        </p>

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
      </form>
    </main>
  )
}

interface SentPanelProps {
  readonly email: string
  readonly onBack: () => void
}

/**
 * "Check your email".
 *
 * On iOS this is where people get stranded, so the order of the two options
 * flips depending on where we are. From the home-screen app, the link is the
 * wrong advice: tapping it in Mail opens Safari, the session lands there
 * instead, and the icon is still signed out — so the code leads. In Safari the
 * link works, so it leads.
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

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: token.trim(),
      type: 'email',
    })

    setBusy(false)
    if (error) setFailed(true)
    // On success the session lands and App re-renders; nothing to do here.
  }

  const linkHelp = (
    <p className="text-lg text-fg-secondary [text-wrap:pretty]">{t('entry.sent.link')}</p>
  )

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
    <main
      className={
        'flex min-h-dvh flex-col bg-app px-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]'
      }
    >
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
              {linkHelp}
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
