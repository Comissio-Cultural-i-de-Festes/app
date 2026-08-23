import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { doorKeys } from '@/features/door/api'
import { errorKey } from '@/lib/errors'

import { setPointValue } from './configApi'
import { type PointValue, fetchPointValues } from './eventFormApi'

/**
 * What each thing is worth.
 *
 * One number per row and no way to add one. A new `clau` is a change in three
 * places — the row, a CHECK constraint, and an allowlist inside award_points —
 * and a screen can only do the first, so the row on its own would be a button
 * that exists, looks right, and fails when somebody presses it at a door. The
 * prototype already drew that button once.
 */
export function ScaleBlock() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<string | null>(null)

  const values = useQuery({ queryKey: doorKeys.pointValues(), queryFn: fetchPointValues })

  const save = useMutation({
    mutationFn: (value: PointValue) =>
      setPointValue({ mena: value.mena, clau: value.clau, punts: value.punts }),
    onSuccess: async (_data, value) => {
      const id = keyOf(value)
      setEdits((previous) => {
        const next = { ...previous }
        delete next[id]
        return next
      })
      setSaved(id)
      await client.invalidateQueries({ queryKey: doorKeys.pointValues() })
    },
  })

  if (values.isPending) return <p className="text-fg-muted">{t('state.loading')}</p>
  if (values.isError) {
    return (
      <p role="alert" className="text-md font-bold text-error [text-wrap:pretty]">
        {t(errorKey(values.error))}
      </p>
    )
  }

  const rows = values.data
  const groups = [
    { mena: 'motiu', heading: t('junta.config.scale.motius'), label: 'motive' },
    { mena: 'tipus_esdeveniment', heading: t('junta.config.scale.tipus'), label: 'eventType' },
  ]

  return (
    <>
      <p className="pb-8 text-md text-fg-secondary [text-wrap:pretty]">
        {t('junta.config.scale.lede')}
      </p>

      {groups.map((group) => (
        <section key={group.mena} className="pb-9">
          <h3 className="eyebrow text-fg-muted">{group.heading}</h3>
          <ul className="mt-2">
            {rows
              .filter((r) => r.mena === group.mena)
              .map((row) => {
                const id = keyOf(row)
                const typed = edits[id]
                const shown = typed ?? String(row.punts)
                const parsed = Number(shown)
                const valid = shown !== '' && Number.isInteger(parsed) && parsed >= 0 && parsed <= 500
                const busy = save.isPending && save.variables !== undefined && keyOf(save.variables) === id

                return (
                  <li
                    key={id}
                    className="flex min-h-[60px] items-center gap-5 border-b border-surface-4 py-4"
                  >
                    <span className="min-w-0 flex-1 text-lg font-semibold">
                      {t(`${group.label}.${row.clau}`, { defaultValue: row.clau })}
                    </span>

                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={500}
                      value={shown}
                      aria-label={t(`${group.label}.${row.clau}`, { defaultValue: row.clau })}
                      onChange={(e) => {
                        setSaved(null)
                        setEdits((previous) => ({ ...previous, [id]: e.target.value }))
                      }}
                      className="min-h-[46px] w-[86px] flex-none border-[1.5px] border-surface-7 bg-surface-1 px-4 text-center text-lg font-bold text-fg outline-none"
                    />

                    {typed === undefined ? (
                      <span className="w-[76px] flex-none text-right text-sm font-bold text-success">
                        {saved === id ? t('junta.config.saved') : ''}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={!valid || busy}
                        onClick={() => {
                          save.mutate({ ...row, punts: parsed })
                        }}
                        className="min-h-[46px] w-[76px] flex-none bg-brand-cta px-3 text-sm font-bold text-on-brand disabled:opacity-50"
                      >
                        {busy ? '…' : t('actions.save')}
                      </button>
                    )}
                  </li>
                )
              })}
          </ul>
        </section>
      ))}

      {save.isError ? (
        <p role="alert" className="pb-6 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(save.error))}
        </p>
      ) : null}

      <p className="text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {t('junta.config.scale.cantAdd')}
      </p>
    </>
  )
}

const keyOf = (v: { readonly mena: string; readonly clau: string }) => `${v.mena}:${v.clau}`
