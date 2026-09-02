import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useMyProfile } from '@/features/session/useMyProfile'
import { formatDayMonth } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import type { MemberRole } from '@/lib/model'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { JuntaHeader } from './JuntaHeader'
import { memberKeys } from './membersApi'
import {
  type RoleChange,
  type RoleRow,
  fetchAdmins,
  fetchMembers,
  fetchRoleChanges,
  roleKeys,
  setRole,
} from './rolesApi'
import { TransferBlock } from './TransferBlock'

/**
 * Qui la porta.
 *
 * ERA UN BLOC DINS DE PAGAMENTS i no és el mateix tema. Hi era perquè les dues
 * coses les fa la junta i cabien a la mateixa pantalla, i el resultat era que
 * l'única manera de nomenar algú passava per la llista de qui ha pagat. Pitjor:
 * aquell bloc només sabia *donar* `admin`. No hi havia cap control per baixar
 * ningú ni cap manera d'arribar a `owner` des de cap pantalla de l'app, o
 * sigui que el traspàs del juny s'havia de fer entrant a la base de dades.
 *
 * LES REGLES AL COSTAT DEL BOTÓ QUE LES TOCA. Cada opció del selector diu què
 * perd i què conserva la persona, perquè «treure-li l'admin» sona a expulsió i
 * no ho és: els punts, les assistències i les fotos es queden.
 *
 * UN ADMIN VEU LA MATEIXA PANTALLA sense «Canvia» a les files dels altres i
 * sense el bloc de traspàs. La base ho refusaria igualment —`admin_set_member_role`
 * no deixa tocar el rol owner a qui no ho és, i `admin_transfer_owner` demana
 * owner— i un botó que sempre falla és pitjor que cap. El que sí que veu és la
 * seva pròpia fila i el botó de nomenar, que sí que pot fer.
 *
 * AMBRE I NO VERMELL a tot el que desfà. El vermell és la comi, i un botó
 * vermell aquí es llegiria com a branding.
 */

const GUTTER = 'px-[var(--ds-gutter)]'
const ROLES: readonly MemberRole[] = ['member', 'admin', 'owner']

type Translate = ReturnType<typeof useTranslation>['t']

export function RolesScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const client = useQueryClient()
  const { data: me } = useMyProfile()
  const owner = me?.role === 'owner'

  const [open, setOpen] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<RoleRow | null>(null)
  const [done, setDone] = useState<{ readonly nombre: string; readonly role: MemberRole } | null>(
    null,
  )
  const [picking, setPicking] = useState(false)

  const admins = useQuery({ queryKey: roleKeys.admins(), queryFn: fetchAdmins })
  const changes = useQuery({ queryKey: roleKeys.changes(), queryFn: fetchRoleChanges })
  const members = useQuery({
    queryKey: roleKeys.members(),
    queryFn: fetchMembers,
    enabled: picking,
  })

  // `done` el posa qui prem, amb el nom que tenia la fila en aquell moment:
  // en baixar algú la fila desapareix de la llista, i llegir-lo després de la
  // invalidació ja no el trobaria.
  const change = useMutation({
    mutationFn: ({ id, role }: { id: string; role: MemberRole }) => setRole(id, role),
    onSuccess: async () => {
      setOpen(null)
      setConfirming(null)
      setPicking(false)
      await refresh(client)
    },
  })

  const rows = admins.data ?? []

  return (
    <main className="min-h-dvh bg-app pb-14">
      <JuntaHeader to="/junta" label={t('junta.back')} title={t('junta.roles.title')} />

      <div className={`pt-8 ${GUTTER}`}>
        <p className="text-md text-fg-secondary [text-wrap:pretty]">{t('junta.roles.what')}</p>
        <p className="mt-6 text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
          {t('junta.roles.audited')}
        </p>
      </div>

      {admins.isPending ? (
        <RolesSkeleton />
      ) : admins.isError ? (
        <p role="alert" className={`pt-8 text-md font-bold text-error ${GUTTER}`}>
          {t(errorKey(admins.error))}
        </p>
      ) : (
        <ul className="mt-10">
          {rows.map((row) => {
            const isMe = row.id === me?.id
            // Qui es pot tocar: un owner pot tocar qualsevol altre; un admin,
            // ningú. I ningú no es toca a si mateix, que és el que fa que el
            // traspàs hagi de ser una funció a part.
            const editable = owner && !isMe
            const opened = open === row.id
            const confirmingThis = confirming?.id === row.id

            return (
              <li
                key={row.id}
                className={
                  'border-b border-surface-4 ' +
                  (opened || confirmingThis ? 'bg-brand-tint-soft' : '')
                }
              >
                <div className={`flex min-h-[64px] items-center gap-5 py-6 ${GUTTER}`}>
                  <Avatar src={row.avatar_url} size={40} ring={isMe} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-bold">{row.nombre}</span>
                    <span className="mt-[2px] block text-sm-lo text-fg-muted">
                      {isMe ? `${t('junta.roles.you')} · ` : ''}
                      {row.escola === null
                        ? t('junta.invites.noSchool')
                        : t(`escola.${row.escola}`)}
                    </span>
                  </span>

                  {row.role === 'owner' ? (
                    <RoleTag role="owner" />
                  ) : editable ? (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirming(null)
                        setOpen(opened ? null : row.id)
                      }}
                      className="flex min-h-[44px] flex-none items-center px-3 text-md font-bold text-brand-label"
                    >
                      {opened ? t('junta.roles.leaveIt') : t('junta.roles.change')}
                    </button>
                  ) : (
                    <RoleTag role={row.role} />
                  )}
                </div>

                {/* S'obre a la fila, com la confirmació de baixa a Socis: cap
                    modal. La fila es tenyeix per dir quina està oberta. */}
                {opened ? (
                  <div className={`pb-9 ${GUTTER}`}>
                    <p className="eyebrow-sm text-fg-muted">
                      {t('junta.roles.whatIs', { name: row.nombre })}
                    </p>
                    <div className="mt-5 flex flex-col gap-3">
                      {ROLES.map((role) => (
                        <RoleOption
                          key={role}
                          role={role}
                          current={row.role === role}
                          onPick={() => {
                            // Baixar demana confirmació; pujar a admin no —és
                            // el que la pantalla existeix per fer, i es desfà
                            // aquí mateix amb un altre toc.
                            if (role === 'member') {
                              setConfirming(row)
                              setOpen(null)
                            } else {
                              change.mutate({ id: row.id, role })
                              setDone({ nombre: row.nombre, role })
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {confirmingThis ? (
                  <div className={`pb-9 ${GUTTER}`}>
                    <p className="text-md font-bold leading-[1.4] [text-wrap:pretty]">
                      {t('junta.roles.demoteTitle', { name: row.nombre })}
                    </p>
                    <p className="mt-4 text-sm-lo leading-[1.4] text-fg-muted-lo [text-wrap:pretty]">
                      {t('junta.roles.demoteBody')}
                    </p>
                    <div className="mt-7 flex gap-4">
                      <button
                        type="button"
                        disabled={change.isPending}
                        onClick={() => {
                          change.mutate({ id: row.id, role: 'member' })
                          setDone({ nombre: row.nombre, role: 'member' })
                        }}
                        className="flex min-h-[46px] flex-1 items-center justify-center border-[1.5px] border-warning px-5 font-body text-md font-bold text-warning disabled:opacity-45 [text-wrap:balance]"
                      >
                        {t('junta.roles.demote')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="flex min-h-[46px] flex-none items-center justify-center px-5 font-body text-md font-bold text-fg-muted"
                      >
                        {t('junta.roles.leaveIt')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {/* Una línia verda que sobreviu que la fila canviï de lloc, com a Socis i
          a Invitacions: en baixar algú desapareix de la llista, i una
          confirmació dins de la fila se n'aniria amb ella. */}
      {done ? (
        <p role="status" className={`pt-8 text-md font-bold text-success ${GUTTER}`}>
          {t('junta.roles.now', { name: done.nombre, role: t(`junta.roles.role.${done.role}`) })}
        </p>
      ) : null}

      {change.isError ? (
        <p role="alert" className={`pt-6 text-md font-bold text-error ${GUTTER}`}>
          {t(errorKey(change.error))}
        </p>
      ) : null}

      <div className={`pt-8 ${GUTTER}`}>
        {picking ? (
          <MemberPicker
            rows={members.data ?? []}
            loading={members.isPending}
            busy={change.isPending}
            onPick={(row) => {
              change.mutate({ id: row.id, role: 'admin' })
              setDone({ nombre: row.nombre, role: 'admin' })
            }}
            onCancel={() => setPicking(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="flex min-h-[54px] w-full items-center justify-center border-[1.5px] border-dashed border-[var(--ds-border-input)] px-7 py-6 font-body text-lg font-bold text-fg [text-wrap:balance]"
          >
            {t('junta.roles.nameAdmin')}
          </button>
        )}
      </div>

      <RecentChanges rows={changes.data ?? []} pending={changes.isPending} locale={locale} />

      {/* Només l'owner. La base ho refusaria igualment, i un bloc que sempre
          falla és pitjor que cap. */}
      {owner ? <TransferBlock admins={rows.filter((r) => r.role === 'admin')} /> : null}
    </main>
  )
}

async function refresh(client: ReturnType<typeof useQueryClient>): Promise<void> {
  await client.invalidateQueries({ queryKey: roleKeys.admins() })
  await client.invalidateQueries({ queryKey: roleKeys.members() })
  await client.invalidateQueries({ queryKey: roleKeys.changes() })
  // I la llista de Socis, que ensenya el rol de cadascú i tenia la seva pròpia
  // clau: sense això el rètol d'allà es queda dient el rol d'abans.
  await client.invalidateQueries({ queryKey: memberKeys.list() })
}

function RoleOption({
  role,
  current,
  onPick,
}: {
  readonly role: MemberRole
  readonly current: boolean
  readonly onPick: () => void
}) {
  const { t } = useTranslation()
  // L'owner surt desactivat amb el motiu escrit i no amagat: la pregunta «com
  // es dóna la propietat?» s'ha de contestar allà on es fa.
  const locked = role === 'owner'

  return (
    <button
      type="button"
      disabled={locked || current}
      onClick={onPick}
      className={
        'flex min-h-[56px] w-full items-start gap-6 border-[1.5px] px-7 py-6 text-left ' +
        (locked
          ? 'border-surface-5 bg-transparent opacity-45'
          : current
            ? 'border-brand-cta bg-brand-tint'
            : 'border-surface-7 bg-surface-1')
      }
    >
      <span
        aria-hidden="true"
        className={
          'mt-[1px] grid size-[22px] flex-none place-items-center rounded-full border-[1.5px] ' +
          (current ? 'border-brand-cta bg-brand-cta' : 'border-surface-7')
        }
      >
        {current ? <span className="block size-2 rounded-full bg-on-brand" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-body text-base font-bold text-fg">
          {t(`junta.roles.role.${role}`)}
        </span>
        <span className="mt-[3px] block font-body text-sm-lo leading-[1.35] text-fg-muted-lo [text-wrap:pretty]">
          {current ? t('junta.roles.currently') : t(`junta.roles.means.${role}`)}
        </span>
      </span>
    </button>
  )
}

function RoleTag({ role }: { readonly role: MemberRole }) {
  const { t } = useTranslation()
  const brand = role === 'owner'
  return (
    <span
      className={
        'flex-none px-[7px] py-[4px] text-2xs font-extrabold tracking-[0.1em] uppercase ' +
        (brand ? 'bg-brand-cta text-on-brand' : 'bg-surface-6 text-fg-secondary')
      }
    >
      {t(`junta.roles.role.${role}`)}
    </span>
  )
}

function RecentChanges({
  rows,
  pending,
  locale,
}: {
  readonly rows: readonly RoleChange[]
  readonly pending: boolean
  readonly locale: ReturnType<typeof toLocale>
}) {
  const { t } = useTranslation()

  return (
    <section className={`mt-14 border-t border-surface-5 pt-9 ${GUTTER}`}>
      <h2 className="eyebrow text-fg-muted">{t('junta.roles.recent')}</h2>

      {pending ? (
        <Skeleton className="mt-1">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-start gap-5 border-b border-surface-4 py-[13px]">
              <SkeletonBar w="w-[52px]" h="h-[12px]" className="flex-none" />
              <SkeletonBar w="w-[70%]" h="h-[14px]" />
            </div>
          ))}
        </Skeleton>
      ) : rows.length === 0 ? (
        <p className="py-7 text-md text-fg-muted [text-wrap:pretty]">
          {t('junta.roles.recentEmpty')}
        </p>
      ) : (
        <ul className="mt-1">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-start gap-5 border-b border-surface-4 py-[13px]"
            >
              <p className="w-[52px] flex-none text-sm-lo font-semibold text-fg-dim">
                {formatDayMonth(new Date(row.created_at), locale)}
              </p>
              <p className="flex-1 text-md leading-[1.35] text-fg-secondary [text-wrap:pretty]">
                {sentence(row, t)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Link to="/junta/registre" className="flex min-h-[48px] items-center text-md font-bold">
        {t('junta.roles.wholeLog')} ›
      </Link>
    </section>
  )
}

/**
 * Una línia del registre en paraules.
 *
 * Quatre formes i no una amb interpolacions: «X ha fet Y admin» i «X li ha
 * tret l'admin a Y» no són la mateixa frase amb una paraula canviada en cap
 * dels tres idiomes, i el traspàs encara menys.
 */
function sentence(row: RoleChange, t: Translate) {
  const actor = row.actor ?? t('junta.roles.someone')
  const target = row.target ?? t('junta.roles.someoneElse')

  if (row.accio === 'transfer_owner') return t('junta.roles.log.transfer', { actor, target })
  if (row.to === 'member') return t('junta.roles.log.demoted', { actor, target })
  if (row.to === 'owner') return t('junta.roles.log.promotedOwner', { actor, target })
  return t('junta.roles.log.named', { actor, target })
}

function MemberPicker({
  rows,
  loading,
  busy,
  onPick,
  onCancel,
}: {
  readonly rows: readonly RoleRow[]
  readonly loading: boolean
  readonly busy: boolean
  readonly onPick: (row: RoleRow) => void
  readonly onCancel: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const needle = query.trim().toLowerCase()
  const shown = needle === '' ? rows : rows.filter((r) => r.nombre.toLowerCase().includes(needle))

  return (
    <div className="border-[1.5px] border-surface-7 bg-surface-1">
      <div className="flex items-center gap-4 border-b border-surface-5 p-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          enterKeyHint="search"
          aria-label={t('junta.roles.searchMember')}
          placeholder={t('junta.roles.searchMember')}
          className="min-h-[44px] min-w-0 flex-1 bg-transparent text-lg font-semibold text-fg outline-none placeholder:font-medium placeholder:text-fg-faint"
        />
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] flex-none px-2 text-md font-bold text-fg-muted"
        >
          {t('actions.cancel')}
        </button>
      </div>

      {loading ? (
        <Skeleton>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex min-h-[52px] items-center gap-4 border-b border-surface-4 px-6 py-5"
            >
              <SkeletonBar w="w-[32px]" h="h-[32px]" className="flex-none rounded-round" />
              <SkeletonBar w="w-[46%]" h="h-[15px]" />
            </div>
          ))}
        </Skeleton>
      ) : shown.length === 0 ? (
        <p className="p-7 text-md text-fg-muted [text-wrap:pretty]">
          {t('junta.roles.noMembers')}
        </p>
      ) : (
        <ul className="max-h-[320px] overflow-y-auto">
          {shown.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(r)}
                className="flex min-h-[52px] w-full items-center gap-4 border-b border-surface-4 px-6 py-5 text-left"
              >
                <Avatar src={r.avatar_url} size={32} />
                <span className="min-w-0 flex-1 truncate text-base font-semibold">{r.nombre}</span>
                <span className="flex-none text-md font-bold text-brand-label">
                  {t('junta.roles.makeAdmin')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RolesSkeleton() {
  return (
    <Skeleton className="mt-10">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex min-h-[64px] items-center gap-5 border-b border-surface-4 px-[var(--ds-gutter)] py-6"
        >
          <SkeletonBar w="w-[40px]" h="h-[40px]" className="flex-none rounded-round" />
          <div className="min-w-0 flex-1">
            <SkeletonBar w="w-[48%]" h="h-[16px]" />
            <SkeletonBar w="w-[64%]" h="h-[11px]" className="mt-[2px]" />
          </div>
          <SkeletonBar w="w-[58px]" h="h-[16px]" className="flex-none" />
        </div>
      ))}
    </Skeleton>
  )
}
