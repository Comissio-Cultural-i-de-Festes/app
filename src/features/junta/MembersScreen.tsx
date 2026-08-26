import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { errorKey } from '@/lib/errors'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { JuntaHeader } from './JuntaHeader'
import { type MemberRow, fetchAllMembers, memberKeys, setMemberEstat } from './membersApi'

/**
 * Who is in the association.
 *
 * Signing somebody out is the only action here, and the wording around it does
 * the real work: "donar de baixa" sounds like deleting somebody, and it is
 * not. Their points stay, their attendance stays, the ranking history stays.
 * What stops is the app letting them in. Saying that next to the button is the
 * difference between a junta that uses this and a junta that never dares.
 *
 * `pendent` is not shown. Approving somebody is the invitations screen's whole
 * purpose, and two places to approve from is two behaviours that drift.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function MembersScreen() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [tab, setTab] = useState<'actiu' | 'baixa'>('actiu')
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [done, setDone] = useState<{ nombre: string; estat: 'actiu' | 'baixa' } | null>(null)

  const members = useQuery({ queryKey: memberKeys.list(), queryFn: fetchAllMembers })

  const change = useMutation({
    mutationFn: (v: { readonly row: MemberRow; readonly estat: 'actiu' | 'baixa' }) =>
      setMemberEstat(v.row.id, v.estat),
    onSuccess: async (_data, v) => {
      // Photographed before the list moves: the row is about to leave this tab
      // and the message has to outlive it. Same reason as the invitations
      // screen's confirmation.
      setDone({ nombre: v.row.nombre, estat: v.estat })
      setConfirming(null)
      await client.invalidateQueries({ queryKey: memberKeys.list() })
    },
  })

  const rows = members.data ?? []
  const needle = query.trim().toLowerCase()
  const mine = rows.filter((r) => r.estat === tab)
  const shown = needle === '' ? mine : mine.filter((r) => r.nombre.toLowerCase().includes(needle))
  const actius = rows.filter((r) => r.estat === 'actiu').length

  return (
    <main className="min-h-dvh bg-app pb-[calc(var(--ds-safe-bottom)+32px)]">
      <JuntaHeader
        to="/junta"
        label={t('junta.back')}
        title={t('junta.members.title')}
        className="lg:hidden"
      />

      <div className={`pt-8 ${GUTTER}`}>
        <p className="text-md text-fg-secondary [text-wrap:pretty]">{t('junta.members.lede')}</p>

        <div className="mt-8 flex gap-4">
          {(['actiu', 'baixa'] as const).map((which) => (
            <button
              key={which}
              type="button"
              aria-pressed={tab === which}
              onClick={() => {
                setTab(which)
                setConfirming(null)
              }}
              className={
                'flex min-h-[46px] flex-1 items-center justify-center px-3 text-md font-bold [text-wrap:balance] ' +
                (tab === which
                  ? 'bg-brand-cta text-on-brand'
                  : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg-secondary')
              }
            >
              {which === 'actiu'
                ? `${t('junta.members.active')} · ${String(actius)}`
                : `${t('junta.members.gone')} · ${String(rows.length - actius)}`}
            </button>
          ))}
        </div>

        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
          }}
          type="search"
          enterKeyHint="search"
          aria-label={t('junta.members.search')}
          placeholder={t('junta.members.search')}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="mt-5 min-h-[50px] w-full border-[1.5px] border-surface-7 bg-surface-1 px-[14px] py-[13px] text-lg font-semibold text-fg outline-none placeholder:font-medium placeholder:text-fg-faint"
        />

        {done === null ? null : (
          <p role="status" className="pt-6 text-md font-bold text-success [text-wrap:pretty]">
            {done.nombre} ·{' '}
            {done.estat === 'baixa' ? t('junta.members.gone') : t('junta.members.active')}
          </p>
        )}

        {change.isError ? (
          <p role="alert" className="pt-6 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(change.error))}
          </p>
        ) : null}
      </div>

      {members.isPending ? (
        <MembersSkeleton />
      ) : members.isError ? (
        <p role="alert" className={`pt-10 text-md font-bold text-error ${GUTTER}`}>
          {t(errorKey(members.error))}
        </p>
      ) : shown.length === 0 ? (
        <p className={`pt-10 text-md text-fg-muted [text-wrap:pretty] ${GUTTER}`}>
          {needle !== ''
            ? t('junta.members.noMatch')
            : tab === 'actiu'
              ? t('junta.members.emptyActive')
              : t('junta.members.emptyGone')}
        </p>
      ) : (
        <ul className="mt-8">
          {shown.map((row) => (
            <li key={row.id} className="border-b border-surface-4">
              <div className={`flex min-h-[64px] items-center gap-5 py-6 ${GUTTER}`}>
                <Avatar src={row.avatar_url} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-3">
                    <span className="min-w-0 truncate text-lg font-semibold">{row.nombre}</span>
                    {row.role === 'member' ? null : (
                      <span className="eyebrow flex-none text-brand-label">
                        {t(`junta.role.${row.role}`)}
                      </span>
                    )}
                  </span>
                  <span className="mt-[2px] block truncate text-sm-lo text-[var(--ds-text-muted-lo)]">
                    {[
                      row.escola === null ? null : t(`escolaShort.${row.escola}`),
                      row.curs === null ? null : t(`onboarding.year.${row.curs}`),
                      row.grau,
                    ]
                      .filter((s): s is string => s !== null && s !== '')
                      .join(' · ')}
                  </span>
                </span>

                {confirming === row.id ? null : (
                  <button
                    type="button"
                    disabled={change.isPending}
                    onClick={() => {
                      setDone(null)
                      if (row.estat === 'actiu') {
                        setConfirming(row.id)
                      } else {
                        change.mutate({ row, estat: 'actiu' })
                      }
                    }}
                    className="min-h-[44px] flex-none px-3 text-sm font-bold text-fg-muted"
                  >
                    {row.estat === 'actiu'
                      ? t('junta.members.signOut')
                      : t('junta.members.bringBack')}
                  </button>
                )}
              </div>

              {/* What it does, before it is done, and the half everybody gets
                  wrong: this is not a delete. */}
              {confirming === row.id ? (
                <div className={`pb-7 ${GUTTER}`}>
                  <p className="text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
                    {t('junta.members.signOutSure')}
                  </p>
                  <div className="mt-5 flex gap-4">
                    <button
                      type="button"
                      disabled={change.isPending}
                      onClick={() => {
                        change.mutate({ row, estat: 'baixa' })
                      }}
                      className="min-h-[46px] flex-1 border-[1.5px] border-[var(--ds-warning)] px-5 text-md font-bold text-[var(--ds-warning)] disabled:opacity-60"
                    >
                      {t('junta.members.signOut')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirming(null)
                      }}
                      className="min-h-[46px] flex-none px-5 text-md font-bold text-fg-muted"
                    >
                      {t('actions.cancel')}
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

/**
 * Cinc files de soci: rodona, nom, la línia d'escola i curs, i el botó.
 *
 * Les classes de la fila són les de la fila de debò, copiades. Una silueta que
 * s'assembla de lluny torna a moure-ho tot quan arriben les dades, i el que es
 * volia evitar era exactament aquest salt.
 */
function MembersSkeleton() {
  return (
    <Skeleton className="mt-8">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`flex min-h-[64px] items-center gap-5 border-b border-surface-4 py-6 ${GUTTER}`}
        >
          <SkeletonBar w="w-[40px]" h="h-[40px]" className="flex-none rounded-round" />
          <div className="min-w-0 flex-1">
            <SkeletonBar w="w-[62%]" h="h-[15px]" />
            <SkeletonBar w="w-[45%]" h="h-[10px]" className="mt-3" />
          </div>
          <SkeletonBar w="w-[52px]" h="h-[13px]" className="flex-none" />
        </div>
      ))}
    </Skeleton>
  )
}
