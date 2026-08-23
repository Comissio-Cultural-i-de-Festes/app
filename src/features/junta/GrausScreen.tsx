import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { onboardingKeys } from '@/features/onboarding/api'
import { errorKey } from '@/lib/errors'
import { ESCOLES, type Escola } from '@/lib/model'

import { type Grau, configKeys, deleteGrau, fetchAllGraus, saveGrau } from './configApi'
import { INPUT } from './formBits'
import { JuntaHeader } from './JuntaHeader'

/**
 * The degree list the first-run screen offers.
 *
 * Renaming is the one operation here that is not bookkeeping: `profiles.grau`
 * holds the name as free text, so a fixed typo has to be carried to everybody
 * who already picked it or the list and the people drift apart permanently,
 * with nothing anywhere that would report it. `admin_save_grau` does the
 * carrying; this screen just has to let somebody type.
 */

interface Draft {
  readonly id: string | null
  readonly escola: Escola
  readonly nom: string
  readonly ordre: string
}

function GrausBlock() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  const graus = useQuery({ queryKey: configKeys.graus(), queryFn: fetchAllGraus })

  const refresh = async () => {
    setDraft(null)
    setConfirming(null)
    await client.invalidateQueries({ queryKey: configKeys.graus() })
    // The picker asks per school and caches per school, so invalidating the
    // list this screen reads would leave the first-run screen on the old one.
    await client.invalidateQueries({ queryKey: onboardingKeys.allDegrees() })
  }

  const save = useMutation({
    mutationFn: (d: Draft) =>
      saveGrau({ id: d.id, escola: d.escola, nom: d.nom.trim(), ordre: Number(d.ordre) || 0 }),
    onSuccess: refresh,
  })

  const remove = useMutation({ mutationFn: deleteGrau, onSuccess: refresh })

  if (graus.isPending) return <p className="text-fg-muted">{t('state.loading')}</p>
  if (graus.isError) {
    return (
      <p role="alert" className="text-md font-bold text-error [text-wrap:pretty]">
        {t(errorKey(graus.error))}
      </p>
    )
  }

  const rows = graus.data
  const busy = save.isPending || remove.isPending

  return (
    <>
      <p className="pb-8 text-md text-fg-secondary [text-wrap:pretty]">
        {t('junta.config.graus.lede')}
      </p>

      {save.isError || remove.isError ? (
        <p role="alert" className="pb-6 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(save.error ?? remove.error))}
        </p>
      ) : null}

      {ESCOLES.map((escola) => {
        const mine = rows.filter((g) => g.escola === escola)
        return (
          <section key={escola} className="pb-9">
            <h3 className="eyebrow text-fg-muted">{t(`escola.${escola}`)}</h3>

            {mine.length === 0 ? (
              <p className="mt-4 text-md text-fg-muted">{t('junta.config.graus.empty')}</p>
            ) : (
              <ul className="mt-2">
                {mine.map((grau) =>
                  draft?.id === grau.id ? (
                    <li key={grau.id} className="border-b border-surface-4 py-6">
                      <DraftForm
                        draft={draft}
                        busy={busy}
                        onChange={setDraft}
                        onCancel={() => {
                          setDraft(null)
                        }}
                        onSave={() => {
                          save.mutate(draft)
                        }}
                      />
                    </li>
                  ) : (
                    <li
                      key={grau.id}
                      className="flex min-h-[60px] items-center gap-4 border-b border-surface-4 py-4"
                    >
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setConfirming(null)
                          setDraft(draftOf(grau))
                        }}
                        className="min-w-0 flex-1 py-2 text-left text-lg font-semibold [text-wrap:pretty]"
                      >
                        {grau.nom}
                      </button>

                      {confirming === grau.id ? (
                        <span className="flex flex-none items-center gap-3">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              remove.mutate(grau.id)
                            }}
                            className="min-h-[44px] border-[1.5px] border-[var(--ds-warning)] px-4 text-sm font-bold text-[var(--ds-warning)] disabled:opacity-60"
                          >
                            {t('actions.confirm')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirming(null)
                            }}
                            className="min-h-[44px] px-3 text-sm font-bold text-fg-muted"
                          >
                            {t('actions.cancel')}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setConfirming(grau.id)
                          }}
                          className="min-h-[44px] flex-none px-3 text-sm font-bold text-fg-muted"
                        >
                          {t('junta.config.graus.remove')}
                        </button>
                      )}
                    </li>
                  ),
                )}
              </ul>
            )}

            {/* Says what it does before it is pressed, and what it will affect:
                the confirmation above is about a list, not about a person. */}
            {confirming !== null && mine.some((g) => g.id === confirming) ? (
              <p className="mt-4 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
                {t('junta.config.graus.removeSure')}
              </p>
            ) : null}

            {draft !== null && draft.id === null && draft.escola === escola ? (
              <div className="mt-6">
                <DraftForm
                  draft={draft}
                  busy={busy}
                  onChange={setDraft}
                  onCancel={() => {
                    setDraft(null)
                  }}
                  onSave={() => {
                    save.mutate(draft)
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setConfirming(null)
                  setDraft({ id: null, escola, nom: '', ordre: String(mine.length + 1) })
                }}
                className="mt-5 min-h-[46px] w-full border-[1.5px] border-surface-7 px-6 text-md font-bold text-fg-secondary disabled:opacity-60"
              >
                {t('junta.config.graus.add')}
              </button>
            )}
          </section>
        )
      })}
    </>
  )
}

function DraftForm({
  draft,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  readonly draft: Draft
  readonly busy: boolean
  readonly onChange: (next: Draft) => void
  readonly onCancel: () => void
  readonly onSave: () => void
}) {
  const { t } = useTranslation()
  const nom = draft.nom.trim()
  const valid = nom.length >= 2 && nom.length <= 120

  return (
    <div>
      <input
        value={draft.nom}
        aria-label={t('junta.config.graus.name')}
        placeholder={t('junta.config.graus.name')}
        onChange={(e) => {
          onChange({ ...draft, nom: e.target.value })
        }}
        className={INPUT}
      />
      <div className="mt-4 flex items-center gap-4">
        <input
          type="number"
          inputMode="numeric"
          value={draft.ordre}
          aria-label={t('junta.config.graus.order')}
          onChange={(e) => {
            onChange({ ...draft, ordre: e.target.value })
          }}
          className="min-h-[46px] w-[86px] flex-none border-[1.5px] border-surface-7 bg-surface-1 px-4 text-center text-lg font-bold text-fg outline-none"
        />
        <button
          type="button"
          disabled={!valid || busy}
          onClick={onSave}
          className="min-h-[46px] flex-1 bg-brand-cta px-6 text-md font-bold text-on-brand disabled:opacity-50"
        >
          {busy ? t('state.updating') : t('actions.save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[46px] flex-none px-4 text-md font-bold text-fg-muted"
        >
          {t('actions.cancel')}
        </button>
      </div>
    </div>
  )
}

const draftOf = (grau: Grau): Draft => ({
  id: grau.id,
  escola: grau.escola,
  nom: grau.nom,
  ordre: String(grau.ordre),
})

const GUTTER = 'px-[var(--ds-gutter)]'

export function GrausScreen() {
  const { t } = useTranslation()
  return (
    <main className="min-h-dvh bg-app pb-[calc(env(safe-area-inset-bottom,0px)+32px)]">
      <JuntaHeader
        to="/junta"
        label={t('junta.back')}
        title={t('junta.config.graus.title')}
        className="lg:hidden"
      />
      <div className={`pt-8 ${GUTTER}`}>
        <GrausBlock />
      </div>
    </main>
  )
}
