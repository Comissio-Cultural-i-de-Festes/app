import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { doorKeys } from '@/features/door/api'
import { fetchPointValues } from '@/features/junta/eventFormApi'
import { useUserId } from '@/features/session/useUserId'
import { formatDateLong } from '@/i18n/format'
import { type Locale, toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { type Proposal, fetchMyVotes, fetchProposals, proposalKeys, vote, withdraw } from './api'
import { useIdeaQueue } from './useIdeaQueue'

/**
 * Ideas, which exist to fill the weeks when nothing is on.
 *
 * The empty state is the one that matters. If events are two or three weeks
 * apart, this screen is the only reason to open the app in between — and a
 * screen that says "nothing here" on the day it ships is a screen nobody ever
 * proposes anything on. So empty invites, with three ideas to start from.
 *
 * "Failed" says something different on purpose. Not knowing how many ideas
 * there are is not the same as there being none, and only one of those two is
 * a reason to distrust the screen.
 */

const GUTTER = 'px-[var(--ds-gutter)]'
const SEEDS = ['ideas.emptySeed1', 'ideas.emptySeed2', 'ideas.emptySeed3'] as const

export function IdeasScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const userId = useUserId()
  const client = useQueryClient()

  const list = useQuery({ queryKey: proposalKeys.list(), queryFn: fetchProposals })
  const votes = useQuery({ queryKey: proposalKeys.myVotes(), queryFn: fetchMyVotes })
  const values = useQuery({ queryKey: doorKeys.pointValues(), queryFn: fetchPointValues })

  const reward = values.data?.find((v) => v.mena === 'motiu' && v.clau === 'propuso')?.punts ?? null
  const points = reward === null ? '' : t('units.points', { count: reward })

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: proposalKeys.list() })
    await client.invalidateQueries({ queryKey: proposalKeys.myVotes() })
  }

  const onSent = useCallback(() => {
    void client.invalidateQueries({ queryKey: proposalKeys.list() })
  }, [client])
  const queue = useIdeaQueue(onSent)

  const toggle = useMutation({
    mutationFn: (v: { readonly id: string; readonly on: boolean }) => vote(v.id, userId, v.on),
    onSuccess: refresh,
  })

  const remove = useMutation({ mutationFn: withdraw, onSuccess: refresh })

  const rows = list.data ?? []
  const open = rows.filter((p) => p.estat === 'oberta')
  const accepted = rows.filter((p) => p.estat === 'acceptada')
  const mine = rows.filter((p) => p.user_id === userId && p.estat !== 'oberta')
  // The bar is a proportion of the leader, not of the membership: it says
  // "this one is close" and not "this one has 3% of the comi behind it".
  const top = Math.max(1, ...open.map((p) => p.vots))

  return (
    <main className="with-tabbar min-h-dvh bg-app">
      <header
        className={`flex items-start justify-between gap-6 pt-[calc(var(--ds-safe-top)+16px)] pb-6 ${GUTTER}`}
      >
        <div className="min-w-0 flex-1">
          <h1 className="display text-d-s tracking-[-0.045em] [text-wrap:balance]">
            {t('ideas.title')}
          </h1>
          <p className="mt-4 text-sm text-fg-muted [text-wrap:pretty]">{t('ideas.lede')}</p>
        </div>
        {/* Never waits for the list. Somebody who opened this screen to say
            something should not be held up by a count. */}
        <Link
          to="/idees/nova"
          className="flex min-h-[44px] flex-none items-center bg-brand-cta px-6 text-md font-bold text-on-brand no-underline"
        >
          {t('ideas.propose')}
        </Link>
      </header>

      {queue.queued === 0 ? null : (
        <p
          role="status"
          className={`flex items-center gap-3 pb-6 text-sm font-bold text-[var(--ds-warning-deep)] ${GUTTER}`}
        >
          <span
            aria-hidden="true"
            className="size-[8px] flex-none animate-pulse rounded-full bg-[var(--ds-warning-deep)]"
          />
          {queue.online
            ? t('ideas.queued', { count: queue.queued })
            : t('ideas.queuedOffline', { count: queue.queued })}
        </p>
      )}

      {list.isPending ? (
        <>
          <p className={`pb-6 text-[12.5px] font-semibold text-fg-muted ${GUTTER}`}>
            {t('ideas.loading')}
          </p>
          <IdeasSkeleton />
          <p
            className={`pt-8 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty] ${GUTTER}`}
          >
            {t('ideas.loadingNote')}
          </p>
        </>
      ) : list.isError ? (
        <Failed error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <Empty points={points} />
      ) : (
        <>
          <p
            className={`pb-4 text-[12.5px] font-semibold text-[var(--ds-text-muted-lo)] ${GUTTER}`}
          >
            {t('ideas.count', { open: open.length })}
          </p>

          {open.map((p, index) => (
            <OpenRow
              key={p.id}
              proposal={p}
              first={index === 0}
              top={top}
              mine={p.user_id === userId}
              voted={votes.data?.has(p.id) ?? false}
              busy={toggle.isPending || remove.isPending}
              onToggle={(on) => {
                toggle.mutate({ id: p.id, on })
              }}
              onWithdraw={() => {
                remove.mutate(p.id)
              }}
            />
          ))}

          {accepted.map((p) => (
            <AcceptedRow key={p.id} proposal={p} locale={locale} mine={p.user_id === userId} />
          ))}

          {mine.length === 0 ? null : <Mine rows={mine} points={points} locale={locale} />}
        </>
      )}

      {toggle.isError || remove.isError ? (
        <p
          role="alert"
          className={`pt-8 text-md font-bold text-error [text-wrap:pretty] ${GUTTER}`}
        >
          {t(errorKey(toggle.error ?? remove.error))}
        </p>
      ) : null}
    </main>
  )
}

// ── the open ones ───────────────────────────────────────────────────────────

function OpenRow({
  proposal,
  first,
  top,
  mine,
  voted,
  busy,
  onToggle,
  onWithdraw,
}: {
  readonly proposal: Proposal
  readonly first: boolean
  readonly top: number
  readonly mine: boolean
  readonly voted: boolean
  readonly busy: boolean
  readonly onToggle: (on: boolean) => void
  readonly onWithdraw: () => void
}) {
  const { t } = useTranslation()

  return (
    <div
      className={
        'flex items-start gap-6 border-b border-surface-4 px-[var(--ds-gutter)] pt-[15px] pb-[14px] ' +
        (first ? 'bg-[var(--ds-bg-winning)] shadow-[inset_3px_0_0_var(--ds-brand)]' : '')
      }
    >
      <span
        className={
          'display tabular w-[44px] flex-none pt-[2px] text-center leading-[0.88] ' +
          'tracking-[-0.05em] ' +
          (first ? 'text-d-s text-brand-label' : 'text-d-sm text-fg-secondary')
        }
      >
        {proposal.vots}
      </span>

      <span className="min-w-0 flex-1">
        {first ? (
          <span className="eyebrow mb-4 inline-block bg-brand px-4 py-[3px] text-[10.5px] tracking-[0.12em] text-on-brand">
            {t('ideas.winning')}
          </span>
        ) : null}
        <span className="block text-base font-bold [text-wrap:pretty]">{proposal.titol}</span>
        <span className="mt-2 flex items-center gap-3">
          <Avatar src={proposal.autor?.avatar_url ?? null} size={20} />
          <span className="min-w-0 truncate text-[12.5px] text-[var(--ds-text-muted-lo)]">
            {proposal.autor?.nombre ?? ''}
          </span>
        </span>
        {proposal.descripcio === null ? null : (
          <span className="mt-2 block text-[12.5px] text-fg-muted [text-wrap:pretty]">
            {proposal.descripcio}
          </span>
        )}
        <span
          aria-hidden="true"
          style={{ width: `${String(Math.round((proposal.vots / top) * 100))}%` }}
          className={`mt-6 block h-[3px] ${first ? 'bg-brand' : 'bg-[var(--ds-bar-idea)]'}`}
        />
        {/* Only while nobody has backed it. Taking away an idea people voted
            for takes their vote away too, which is why the policy says so and
            not just this button. */}
        {mine && proposal.vots === 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={onWithdraw}
            className="mt-5 min-h-[36px] text-[12.5px] font-bold text-fg-muted"
          >
            {t('ideas.withdraw')}
          </button>
        ) : null}
      </span>

      <button
        type="button"
        disabled={busy}
        aria-pressed={voted}
        onClick={() => {
          onToggle(!voted)
        }}
        className={
          'flex min-h-[44px] min-w-[88px] flex-none items-center justify-center px-5 py-4 ' +
          'text-[14.5px] font-bold [text-wrap:balance] disabled:opacity-60 ' +
          (voted
            ? 'bg-brand text-on-brand'
            : 'border-[1.5px] border-[var(--ds-border-input)] text-fg-secondary')
        }
      >
        {voted ? t('ideas.voted') : t('ideas.vote')}
      </button>
    </div>
  )
}

function AcceptedRow({
  proposal,
  locale,
  mine,
}: {
  readonly proposal: Proposal
  readonly locale: Locale
  readonly mine: boolean
}) {
  const { t } = useTranslation()
  const when =
    proposal.esdeveniment === null
      ? null
      : formatDateLong(new Date(proposal.esdeveniment.starts_at), locale)

  return (
    <div className="flex items-center gap-6 border-b border-surface-4 bg-[var(--ds-bg-live)] px-[var(--ds-gutter)] py-6">
      <span className="tabular w-[44px] flex-none display text-center text-d-sm leading-[0.88] tracking-[-0.05em] text-success">
        {proposal.vots}
      </span>
      <span className="min-w-0 flex-1">
        <span className="eyebrow block text-success">{t('ideas.accepted')}</span>
        <span className="mt-2 block text-base font-bold [text-wrap:pretty]">{proposal.titol}</span>
        <span className="mt-2 block text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
          {when === null
            ? (proposal.autor?.nombre ?? '')
            : t('ideas.hasDate', {
                who: mine ? t('ideas.mine') : (proposal.autor?.nombre ?? ''),
                when,
              })}
        </span>
      </span>
      {proposal.event_id === null ? null : (
        <Link
          to={`/esdeveniment/${proposal.event_id}`}
          className="flex min-h-[44px] flex-none items-center border-[1.5px] border-surface-7 px-5 text-md font-bold text-fg no-underline"
        >
          {t('ideas.goToEvent')}
        </Link>
      )}
    </div>
  )
}

// ── the ones that are only yours ────────────────────────────────────────────

function Mine({
  rows,
  points,
  locale,
}: {
  readonly rows: readonly Proposal[]
  readonly points: string
  readonly locale: Locale
}) {
  const { t } = useTranslation()

  return (
    <section className="pt-12">
      <div className={GUTTER}>
        <h2 className="eyebrow text-fg-muted">{t('ideas.mine')}</h2>
        <p className="mt-4 text-sm text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
          {t('ideas.mineLede')}
        </p>
      </div>

      <div className="mt-6">
        {rows.map((p) => (
          <div
            key={p.id}
            className={`flex items-start gap-6 border-t border-surface-4 py-6 ${GUTTER}`}
          >
            <span className="tabular w-[44px] flex-none display text-center text-d-sm leading-[0.88] tracking-[-0.05em] text-fg-muted">
              {p.vots}
            </span>
            <span className="min-w-0 flex-1">
              {p.estat === 'descartada' ? (
                <span className="eyebrow block text-[var(--ds-warning-deep)]">
                  {t('ideas.discarded')}
                </span>
              ) : null}
              <span className="mt-2 block text-base font-bold [text-wrap:pretty]">{p.titol}</span>

              {p.estat === 'acceptada' && points !== '' ? (
                <span className="mt-3 block text-[12.5px] text-success">
                  <span className="font-bold">{`+${points}`}</span>
                  {` ${t('ideas.minePaid')}`}
                </span>
              ) : null}

              {/* The reason, and who wrote it. A stamp with no sentence is what
                  this column exists to replace. */}
              {p.nota_junta === null ? null : (
                <span className="mt-5 block border-l-[3px] border-surface-7 bg-surface-1 px-6 py-5">
                  <span className="eyebrow block text-[var(--ds-text-muted-lo)]">
                    {t('ideas.juntaSays')}
                  </span>
                  <span className="mt-3 block text-sm text-fg-secondary [text-wrap:pretty]">
                    {p.nota_junta}
                  </span>
                  {p.decisor === null || p.decided_at === null ? null : (
                    <span className="mt-3 block text-[12px] text-[var(--ds-text-muted-lo)]">
                      {t('ideas.decidedBy', {
                        who: p.decisor.nombre,
                        when: formatDateLong(new Date(p.decided_at), locale),
                      })}
                    </span>
                  )}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      <p
        className={`pt-8 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty] ${GUTTER}`}
      >
        {t('ideas.privateNote')}
      </p>
    </section>
  )
}

// ── the three states ────────────────────────────────────────────────────────

/**
 * Empty, and inviting.
 *
 * The three suggestions are not filler: a blank title field on a screen
 * somebody opened out of curiosity is where an idea dies. Tapping one fills
 * the title and the form is still editable.
 */
function Empty({ points }: { readonly points: string }) {
  const { t } = useTranslation()

  return (
    <section className={`pt-6 ${GUTTER}`}>
      <p className="text-lg font-bold [text-wrap:balance]">{t('ideas.emptyTitle')}</p>
      <p className="mt-5 text-md text-fg-secondary [text-wrap:pretty]">{t('ideas.emptyLede')}</p>

      <p className="eyebrow pt-10 text-fg-muted">{t('ideas.emptyPick')}</p>
      <ul className="mt-4">
        {SEEDS.map((key) => (
          <li key={key}>
            <Link
              to={`/idees/nova?titol=${encodeURIComponent(t(key))}`}
              className="flex min-h-[52px] items-center border-b border-surface-4 text-base font-semibold text-fg no-underline"
            >
              {t(key)}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {t('ideas.emptyPickNote')}
      </p>

      <Link
        to="/idees/nova"
        className="mt-9 flex min-h-[56px] w-full items-center justify-center bg-brand-cta px-8 text-lg font-bold text-on-brand no-underline [text-wrap:balance]"
      >
        {t('ideas.emptyCta')}
      </Link>
      <p className="mt-6 pb-8 text-sm text-fg-muted [text-wrap:pretty]">
        {t('ideas.emptyFoot', { points })}
      </p>
    </section>
  )
}

/**
 * Not "no ideas".
 *
 * This screen never says the list is empty when it could not be read, because
 * the two lead somewhere different: one invites and the other warns. Proposing
 * still works, and so does saying so.
 */
function Failed({ error, onRetry }: { readonly error: unknown; readonly onRetry: () => void }) {
  const { t } = useTranslation()

  return (
    <section className={`pt-6 pb-8 ${GUTTER}`}>
      <p role="alert" className="eyebrow text-[var(--ds-warning)]">
        {t('ideas.failed')}
      </p>
      <p className="mt-5 text-md text-fg-secondary [text-wrap:pretty]">{t('ideas.failedSub')}</p>
      <p className="mt-3 text-sm text-fg-muted [text-wrap:pretty]">{t(errorKey(error))}</p>

      <div className="mt-8 flex flex-wrap gap-5">
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[50px] flex-1 border-[1.5px] border-[var(--ds-warning)] px-6 text-md font-bold text-[var(--ds-warning)]"
        >
          {t('actions.retry')}
        </button>
        <Link
          to="/idees/nova"
          className="flex min-h-[50px] flex-1 items-center justify-center border-[1.5px] border-surface-7 px-6 text-md font-bold text-fg-secondary no-underline"
        >
          {t('ideas.failedAnyway')}
        </Link>
      </div>

      <div className="mt-10 border-t border-surface-4 pt-8">
        <p className="eyebrow text-fg-muted">{t('ideas.failedVotes')}</p>
        <p className="display mt-3 text-d-sm leading-none text-fg-muted">—</p>
        <p className="mt-3 text-sm text-fg-muted [text-wrap:pretty]">{t('ideas.failedVotesSub')}</p>
      </div>
    </section>
  )
}

function IdeasSkeleton() {
  return (
    <Skeleton>
      {[0, 1, 2].map((i) => (
        <div key={i} className={`flex items-start gap-6 border-b border-surface-4 py-6 ${GUTTER}`}>
          <SkeletonBar w="w-[34px]" h="h-[26px]" className="flex-none" />
          <span className="min-w-0 flex-1">
            <SkeletonBar w="w-[75%]" h="h-[13px]" />
            <SkeletonBar w="w-[45%]" h="h-[11px]" className="mt-4" />
          </span>
          <SkeletonBar w="w-[88px]" h="h-[44px]" className="flex-none" />
        </div>
      ))}
    </Skeleton>
  )
}
