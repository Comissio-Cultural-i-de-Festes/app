import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDateTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import type { Escola } from '@/lib/model'

import { JuntaHeader } from './JuntaHeader'
import {
  type InviteRow,
  activeInvite,
  createInvite,
  fetchInvites,
  fetchPending,
  inviteLink,
  juntaKeys,
  revokeInvite,
  setMemberState,
  usesOf,
} from './invitesApi'

/**
 * Who gets in.
 *
 * One live code at a time, and the model behind that is the point: a single
 * string to paste into the group, and killing it is one action rather than an
 * investigation into which of nine codes leaked. Anybody already in stays in —
 * revoking only closes the door behind them.
 */

const GUTTER = 'px-[var(--ds-gutter)]'
const CODE_DAYS = 7
const CODE_USES = 40

export function InvitesScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const client = useQueryClient()
  const [copied, setCopied] = useState(false)

  const invites = useQuery({ queryKey: juntaKeys.invites(), queryFn: fetchInvites })
  const pending = useQuery({ queryKey: juntaKeys.pending(), queryFn: fetchPending })

  const rotate = useMutation({
    mutationFn: async (current: InviteRow | null) => {
      if (current) await revokeInvite(current.id)
      const expires = new Date(Date.now() + CODE_DAYS * 24 * 60 * 60 * 1000)
      await createInvite(expires, CODE_USES)
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: juntaKeys.invites() })
    },
  })

  const decide = useMutation({
    mutationFn: ({ id, estat }: { id: string; estat: 'actiu' | 'baixa' }) =>
      setMemberState(id, estat),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: juntaKeys.pending() })
    },
  })

  const live = activeInvite(invites.data ?? [])
  const shareText =
    live === null
      ? ''
      : t('junta.invites.shareText', { link: inviteLink(live.codi), code: live.codi })

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
      }, 2500)
    } catch {
      // Clipboard permission refused, or an insecure origin. The text is on
      // screen and selectable, which is the fallback that always works.
      setCopied(false)
    }
  }

  return (
    <main className="min-h-dvh bg-app pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
      <JuntaHeader
        to="/junta"
        className="lg:hidden"
        label={t('junta.back')}
        title={t('junta.invites.title')}
      />

      {/* The phone puts the page title in the header it goes back through.
          On a laptop that header is the top bar, so the title needs a row of
          its own — and the page needs an h1 either way. */}
      <div className="hidden items-center border-b border-surface-5 px-14 py-7 lg:flex">
        <h1 className="display text-[30px] leading-none tracking-[-0.045em]">
          {t('junta.invites.title')}
        </h1>
      </div>

      <div className="lg:grid lg:grid-cols-[404px_1fr] lg:items-start lg:gap-15 lg:px-14 lg:pb-16">
        <section className={`pt-8 ${GUTTER}`}>
          <h2 className="text-xs font-extrabold tracking-[0.16em] text-fg-muted uppercase">
            {t('junta.invites.whoEnters')}
          </h2>
          <p className="mt-4 text-sm text-fg-muted [text-wrap:pretty]">
            {t('junta.invites.oneCode')}
          </p>

          {invites.isPending ? (
            <p className="py-8 text-fg-muted">{t('state.loading')}</p>
          ) : live === null ? (
            <div className="mt-8 border-[1.5px] border-dashed border-[var(--ds-border-input)] bg-surface-1 px-9 py-8">
              <p className="text-md text-fg-secondary [text-wrap:pretty]">
                {t('junta.invites.none')}
              </p>
            </div>
          ) : (
            <>
              <div className="mt-8 border border-border-strong bg-surface-1 px-9 py-8">
                <p className="text-2xs font-extrabold tracking-[0.14em] text-fg-muted uppercase">
                  {t('junta.invites.activeCode')}
                </p>
                <p className="display mt-4 text-d-sm tracking-[0.02em]">{live.codi}</p>
                <p className="mt-4 text-sm font-semibold text-fg-muted [text-wrap:pretty]">
                  {live.expires_at === null
                    ? t('junta.invites.neverExpires')
                    : t('junta.invites.expires', {
                        when: formatDateTime(new Date(live.expires_at), locale),
                      })}
                </p>
                <p className="mt-2 text-sm font-semibold text-fg-muted">
                  {live.max_usos === null
                    ? t('junta.invites.usesOpen', { used: usesOf(live) })
                    : t('junta.invites.uses', { used: usesOf(live), max: live.max_usos })}
                </p>
              </div>

              <p className="mt-9 text-2xs font-extrabold tracking-[0.14em] text-fg-muted uppercase">
                {t('junta.invites.willPaste')}
              </p>
              <p className="mt-4 border-l-[3px] border-surface-7 bg-surface-1 px-8 py-6 text-md text-fg-secondary [text-wrap:pretty]">
                {shareText}
              </p>

              <button
                type="button"
                onClick={() => void copy()}
                className="mt-6 flex min-h-[56px] w-full items-center justify-center bg-brand-cta px-9 py-4 text-lg font-bold text-on-brand [text-wrap:balance]"
              >
                {copied ? t('junta.invites.copied') : t('junta.invites.copy')}
              </button>
            </>
          )}

          <button
            type="button"
            disabled={rotate.isPending}
            onClick={() => {
              rotate.mutate(live)
            }}
            className="mt-9 min-h-[44px] cursor-pointer border-0 bg-transparent p-0 text-left text-md font-bold text-warning disabled:opacity-70"
          >
            {rotate.isPending
              ? t('state.updating')
              : live === null
                ? t('junta.invites.makeFirst')
                : t('junta.invites.killAndRemake')}
          </button>
          <p className="mt-2 text-sm text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
            {t('junta.invites.killExplains')}
          </p>
          {rotate.isError ? (
            <p role="alert" className="mt-4 text-md font-bold text-error">
              {t('errors.generic')}
            </p>
          ) : null}
        </section>

        <section className={`pt-12 ${GUTTER}`}>
          <h2 className="text-xs font-extrabold tracking-[0.16em] text-fg-muted uppercase">
            {t('junta.invites.wantIn')}
          </h2>

          {pending.isPending ? (
            <p className="py-8 text-fg-muted">{t('state.loading')}</p>
          ) : (pending.data?.length ?? 0) === 0 ? (
            <p className="py-8 text-md text-fg-muted [text-wrap:pretty]">
              {t('junta.invites.nobodyWaiting')}
            </p>
          ) : (
            <ul className="mt-2">
              {pending.data?.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-4 border-b border-surface-4 py-[15px]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold">{p.nombre}</p>
                    <p className="mt-[3px] text-[12.5px] text-[var(--ds-text-muted-lo)]">
                      {p.escola === null
                        ? t('junta.invites.noSchool')
                        : t(`escolaShort.${p.escola satisfies Escola}`)}
                      {' · '}
                      {formatDateTime(new Date(p.created_at), locale)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={decide.isPending}
                    onClick={() => {
                      decide.mutate({ id: p.id, estat: 'baixa' })
                    }}
                    className="min-h-[44px] flex-none border-[1.5px] border-surface-7 px-6 text-md font-bold text-fg-secondary disabled:opacity-70"
                  >
                    {t('junta.invites.reject')}
                  </button>
                  <button
                    type="button"
                    disabled={decide.isPending}
                    onClick={() => {
                      decide.mutate({ id: p.id, estat: 'actiu' })
                    }}
                    className="min-h-[44px] flex-none bg-brand-cta px-6 text-md font-bold text-on-brand disabled:opacity-70"
                  >
                    {t('junta.invites.letIn')}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-8 text-sm text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
            {t('junta.invites.askFirst')}
          </p>
        </section>
      </div>
    </main>
  )
}
