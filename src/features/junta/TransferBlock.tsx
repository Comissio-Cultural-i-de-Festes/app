import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { profileKeys } from '@/features/session/profile'
import { useUserId } from '@/features/session/useUserId'
import { errorKey } from '@/lib/errors'
import { Avatar } from '@/ui/Avatar/Avatar'

import { memberKeys } from './membersApi'
import { type RoleRow, roleKeys, transferOwner } from './rolesApi'

/**
 * Traspassar la propietat, en dos passos i amb una casella.
 *
 * AL JUNY, QUAN LA JUNTA CANVIA, i una sola vegada. Per això no és un selector
 * de rol com els altres: hi ha d'haver sempre exactament un owner, i donar-la
 * vol dir deixar de tenir-la. Una sola RPC (migració 43) perquè pujar l'altre i
 * baixar-te en dos passos deixaria l'associació amb dos owners o amb cap.
 *
 * LA CASELLA NO ÉS BUROCRÀCIA. És l'única manera que el pas 2 sigui una
 * decisió i no una segona pantalla que es passa amb el dit. El que hi ha
 * escrit al costat és el que de debò no es pot desfer: des d'aquest moment
 * només ella pot tornar-la, i si perd el compte de Google caldrà entrar a la
 * base de dades.
 *
 * NOMÉS ADMINS A LA LLISTA. Passar la propietat a algú que no porta res seria
 * donar-la a qui no sap que la té, i la base ho refusa igualment.
 *
 * DESPRÉS DEL TRASPÀS AQUEST BLOC DESAPAREIX SOL: qui el mira ja no és owner, i
 * `RolesScreen` només el dibuixa per a qui ho és. Per això la invalidació
 * inclou el propi perfil i no només les llistes.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function TransferBlock({ admins }: { readonly admins: readonly RoleRow[] }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const userId = useUserId()

  const [chosen, setChosen] = useState<RoleRow | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [open, setOpen] = useState(false)

  const transfer = useMutation({
    mutationFn: (id: string) => transferOwner(id),
    onSuccess: async () => {
      setChosen(null)
      setAgreed(false)
      setOpen(false)
      await client.invalidateQueries({ queryKey: profileKeys.me(userId) })
      await client.invalidateQueries({ queryKey: roleKeys.admins() })
      await client.invalidateQueries({ queryKey: roleKeys.changes() })
      await client.invalidateQueries({ queryKey: memberKeys.list() })
    },
  })

  if (!open) {
    return (
      <section className={`mt-12 border-t border-surface-5 pt-9 ${GUTTER}`}>
        <h2 className="display text-d-xs leading-[1.05] tracking-[-0.04em] [text-wrap:balance]">
          {t('junta.roles.transfer.title')}
        </h2>
        <p className="mt-5 text-sm leading-[1.4] text-fg-muted [text-wrap:pretty]">
          {t('junta.roles.transfer.why')}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-8 flex min-h-[48px] w-full items-center justify-center border-[1.5px] border-warning px-7 py-6 font-body text-base font-bold text-warning [text-wrap:balance]"
        >
          {t('junta.roles.transfer.start')}
        </button>
      </section>
    )
  }

  return (
    <section className={`mt-12 border-t border-surface-5 pt-9 ${GUTTER}`}>
      <p className="eyebrow-sm text-fg-muted">{t('junta.roles.transfer.step1')}</p>

      {admins.length === 0 ? (
        // Sense cap admin no hi ha res a triar, i el motiu no és evident: cal
        // nomenar-ne un primer, amb el botó que hi ha just a sobre.
        <p className="mt-6 text-md text-fg-muted [text-wrap:pretty]">
          {t('junta.roles.transfer.noAdmins')}
        </p>
      ) : (
        <ul className="mt-6 border-[1.5px] border-surface-7 bg-surface-1">
          {admins.map((row, i) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => {
                  setChosen(row)
                  setAgreed(false)
                }}
                className={
                  'flex min-h-[56px] w-full items-center gap-4 px-6 py-5 text-left ' +
                  (i < admins.length - 1 ? 'border-b border-surface-4 ' : '') +
                  (chosen?.id === row.id ? 'bg-brand-tint-soft' : '')
                }
              >
                <Avatar src={row.avatar_url} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">{row.nombre}</span>
                  <span className="mt-[2px] block text-sm-lo text-fg-muted-lo">
                    {t('junta.roles.role.admin')}
                    {row.escola === null ? '' : ` · ${t(`escola.${row.escola}`)}`}
                  </span>
                </span>
                <span className="flex-none text-md font-bold text-brand-label">
                  {chosen?.id === row.id ? t('junta.roles.transfer.chosen') : t('junta.roles.transfer.choose')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 text-sm-lo leading-[1.4] text-fg-muted-lo [text-wrap:pretty]">
        {t('junta.roles.transfer.adminsOnly')}
      </p>

      {chosen === null ? null : (
        <div className="mt-12 border-t border-surface-5 pt-9">
          <p className="eyebrow-sm text-warning-deep">{t('junta.roles.transfer.step2')}</p>

          <div className="mt-6 border-l-[3px] border-warning bg-surface-1 px-9 py-8">
            <p className="display text-d-xs leading-[1.05] tracking-[-0.04em] [text-wrap:balance]">
              {t('junta.roles.transfer.willBe', { name: chosen.nombre })}
            </p>
            <p className="mt-5 text-md leading-[1.4] text-fg-secondary [text-wrap:pretty]">
              {t('junta.roles.transfer.consequence')}
            </p>

            <button
              type="button"
              role="checkbox"
              aria-checked={agreed}
              onClick={() => setAgreed(!agreed)}
              className="mt-7 flex w-full items-center gap-5 border-t border-surface-6 pt-6 text-left"
            >
              <span
                aria-hidden="true"
                className={
                  'grid size-[24px] flex-none place-items-center border-[1.5px] border-warning text-sm font-extrabold ' +
                  (agreed ? 'bg-warning text-on-state' : 'text-transparent')
                }
              >
                ✓
              </span>
              <span className="flex-1 text-sm leading-[1.35] text-fg-secondary [text-wrap:pretty]">
                {t('junta.roles.transfer.agreed', { name: chosen.nombre })}
              </span>
            </button>
          </div>

          <button
            type="button"
            disabled={!agreed || transfer.isPending}
            onClick={() => transfer.mutate(chosen.id)}
            className="mt-8 flex min-h-[56px] w-full items-center justify-center border-[1.5px] border-warning px-7 py-8 font-body text-lg font-bold text-warning disabled:opacity-45 [text-wrap:balance]"
          >
            {transfer.isPending
              ? t('state.saving')
              : t('junta.roles.transfer.confirm', { name: chosen.nombre })}
          </button>

          {transfer.isError ? (
            <p role="alert" className="mt-5 text-md font-bold text-error [text-wrap:pretty]">
              {t(errorKey(transfer.error))}
            </p>
          ) : null}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setOpen(false)
          setChosen(null)
          setAgreed(false)
        }}
        className="mt-6 flex min-h-[48px] w-full items-center justify-center font-body text-base font-bold text-fg-muted"
      >
        {t('junta.roles.leaveIt')}
      </button>
    </section>
  )
}
