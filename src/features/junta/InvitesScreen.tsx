import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDateTime } from '@/i18n/format'
import { errorKey } from '@/lib/errors'
import { toLocale } from '@/i18n/locales'
import type { Escola } from '@/lib/model'
import { Notice } from '@/ui/Notice/Notice'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

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
  const [confirming, setConfirming] = useState(false)

  const invites = useQuery({ queryKey: juntaKeys.invites(), queryFn: fetchInvites })
  const pending = useQuery({ queryKey: juntaKeys.pending(), queryFn: fetchPending })

  const rotate = useMutation({
    mutationFn: async (current: InviteRow | null) => {
      if (current) await revokeInvite(current.id)
      const expires = new Date(Date.now() + CODE_DAYS * 24 * 60 * 60 * 1000)
      await createInvite(expires, CODE_USES)
    },
    onSuccess: async () => {
      setConfirming(false)
      await client.invalidateQueries({ queryKey: juntaKeys.invites() })
    },
  })

  // The row vanishes the moment the decision lands, so the confirmation has
  // to be taken before the list refetches or there is nothing left to name.
  // Same trick as the points screen, which snapshots the count before clearing
  // the selection.
  const [decided, setDecided] = useState<{ nombre: string; estat: 'actiu' | 'baixa' } | null>(null)
  const [deciding, setDeciding] = useState<string | null>(null)

  const decide = useMutation({
    mutationFn: ({ id, estat }: { id: string; estat: 'actiu' | 'baixa'; nombre: string }) =>
      setMemberState(id, estat),
    onSuccess: async (_data, variables) => {
      setDecided({ nombre: variables.nombre, estat: variables.estat })
      setDeciding(null)
      await client.invalidateQueries({ queryKey: juntaKeys.pending() })
    },
    onError: () => {
      setDeciding(null)
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
    <main className="min-h-dvh bg-app pb-[calc(var(--ds-safe-bottom)+24px)]">
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
        <h1 className="display text-d-s leading-none tracking-[-0.045em]">
          {t('junta.invites.title')}
        </h1>
      </div>

      <div className="lg:grid lg:grid-cols-[404px_1fr] lg:items-start lg:gap-15 lg:px-14 lg:pb-16">
        <section className={`pt-8 ${GUTTER}`}>
          <h2 className="eyebrow text-fg-muted">{t('junta.invites.whoEnters')}</h2>
          <p className="mt-4 text-sm text-fg-muted [text-wrap:pretty]">
            {t('junta.invites.oneCode')}
          </p>

          {invites.isPending ? (
            <CodeSkeleton />
          ) : live === null ? (
            <div className="mt-8 border-[1.5px] border-dashed border-[var(--ds-border-input)] bg-surface-1 px-9 py-8">
              <p className="text-md text-fg-secondary [text-wrap:pretty]">
                {t('junta.invites.none')}
              </p>
            </div>
          ) : (
            <>
              <div className="mt-8 border border-border-strong bg-surface-1 px-9 py-8">
                <p className="eyebrow-sm text-fg-muted">{t('junta.invites.activeCode')}</p>
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

              <p className="eyebrow-sm mt-9 text-fg-muted">{t('junta.invites.willPaste')}</p>
              <Notice tone="neutral" size="tight" className="mt-4">
                {shareText}
              </Notice>

              <button
                type="button"
                onClick={() => void copy()}
                className="mt-6 flex min-h-[56px] w-full items-center justify-center bg-brand-cta px-9 py-4 text-lg font-bold text-on-brand [text-wrap:balance]"
              >
                {copied ? t('junta.invites.copied') : t('junta.invites.copy')}
              </button>
            </>
          )}

          {/* Amb codi viu, dos temps. Aquest botó revoca a l'instant l'enllaç
              que hi ha enganxat al grup de WhatsApp: un toc per error i deixa
              de funcionar per a cent persones que no se n'assabenten fins que
              algú es queixa. Sense codi viu no hi ha res a perdre i queda d'un
              toc, com abans. */}
          {confirming ? (
            <div className="mt-9">
              <p className="text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
                {t('junta.invites.killSure')}
              </p>
              <div className="mt-5 flex gap-4">
                <button
                  type="button"
                  disabled={rotate.isPending}
                  onClick={() => {
                    rotate.mutate(live)
                  }}
                  className="min-h-[46px] flex-1 border-[1.5px] border-warning px-5 text-md font-bold text-warning disabled:opacity-60"
                >
                  {rotate.isPending ? t('state.updating') : t('junta.invites.killAndRemake')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false)
                  }}
                  className="min-h-[46px] flex-none px-5 text-md font-bold text-fg-muted"
                >
                  {t('actions.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={rotate.isPending}
                onClick={() => {
                  if (live === null) {
                    rotate.mutate(live)
                  } else {
                    setConfirming(true)
                  }
                }}
                className="mt-9 min-h-[44px] cursor-pointer border-0 bg-transparent p-0 text-left text-md font-bold text-warning disabled:opacity-70"
              >
                {rotate.isPending
                  ? t('state.updating')
                  : live === null
                    ? t('junta.invites.makeFirst')
                    : t('junta.invites.killAndRemake')}
              </button>
              <p className="mt-2 text-sm text-fg-muted-lo [text-wrap:pretty]">
                {t('junta.invites.killExplains')}
              </p>
            </>
          )}
          {rotate.isError ? (
            <p role="alert" className="mt-4 text-md font-bold text-error">
              {t(errorKey(rotate.error))}
            </p>
          ) : null}
        </section>

        <section className={`pt-12 ${GUTTER}`}>
          <h2 className="eyebrow text-fg-muted">{t('junta.invites.wantIn')}</h2>

          {decide.isError ? (
            <p role="alert" className="pt-6 text-md font-bold text-error [text-wrap:pretty]">
              {t(errorKey(decide.error))}
            </p>
          ) : null}

          {decided === null ? null : (
            <p
              role="status"
              className={
                'pt-6 text-md font-bold [text-wrap:pretty] ' +
                (decided.estat === 'actiu' ? 'text-success' : 'text-fg-muted')
              }
            >
              {decided.estat === 'actiu'
                ? t('junta.invites.letInDone', { name: decided.nombre })
                : t('junta.invites.rejectDone', { name: decided.nombre })}
            </p>
          )}

          {pending.isPending ? (
            <PendingSkeleton />
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
                    <p className="mt-[3px] text-sm-lo text-[var(--ds-text-muted-lo)]">
                      {p.escola === null
                        ? t('junta.invites.noSchool')
                        : t(`escolaShort.${p.escola satisfies Escola}`)}
                      {' · '}
                      {formatDateTime(new Date(p.created_at), locale)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={deciding !== null}
                    onClick={() => {
                      setDeciding(p.id)
                      decide.mutate({ id: p.id, estat: 'baixa', nombre: p.nombre })
                    }}
                    className="min-h-[44px] min-w-[52px] flex-none border-[1.5px] border-surface-7 px-6 text-md font-bold text-fg-secondary disabled:opacity-70"
                  >
                    {t('junta.invites.reject')}
                  </button>
                  <button
                    type="button"
                    disabled={deciding !== null}
                    onClick={() => {
                      setDeciding(p.id)
                      decide.mutate({ id: p.id, estat: 'actiu', nombre: p.nombre })
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

/**
 * El plafó del codi viu: la caixa, el codi en gran, les dues línies de sota, el
 * text per enganxar i el botó de copiar.
 *
 * És la meitat de la pantalla que decideix l'alçada de tot. Amb un «Carregant…»
 * de vuit píxels, el botó de copiar apareixia de cop dos-cents més avall.
 */
function CodeSkeleton() {
  return (
    <Skeleton>
      <div className="mt-8 border border-border-strong bg-surface-1 px-9 py-8">
        <SkeletonBar w="w-[38%]" h="h-[10px]" />
        <SkeletonBar w="w-[62%]" h="h-[30px]" className="mt-4" />
        <SkeletonBar w="w-[70%]" h="h-[12px]" className="mt-4" />
        <SkeletonBar w="w-[45%]" h="h-[12px]" className="mt-2" />
      </div>
      <SkeletonBar w="w-[42%]" h="h-[10px]" className="mt-9" />
      <SkeletonBar w="w-full" h="h-[62px]" className="mt-4" />
      <SkeletonBar w="w-full" h="h-[56px]" className="mt-6" />
    </Skeleton>
  )
}

/** Qui espera a la porta: nom, escola i data, i els dos botons de decidir. */
function PendingSkeleton() {
  return (
    <Skeleton className="mt-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b border-surface-4 py-[15px]">
          <div className="min-w-0 flex-1">
            <SkeletonBar w="w-[58%]" h="h-[15px]" />
            <SkeletonBar w="w-[80%]" h="h-[10px]" className="mt-[3px]" />
          </div>
          <SkeletonBar w="w-[72px]" h="h-[44px]" className="flex-none" />
          <SkeletonBar w="w-[78px]" h="h-[44px]" className="flex-none" />
        </div>
      ))}
    </Skeleton>
  )
}
