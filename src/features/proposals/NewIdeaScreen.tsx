import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'

import { doorKeys } from '@/features/door/api'
import { fetchPointValues } from '@/features/junta/eventFormApi'
import { Field, INPUT } from '@/features/junta/formBits'
import { JuntaHeader } from '@/features/junta/JuntaHeader'
import { useUserId } from '@/features/session/useUserId'
import { errorKey } from '@/lib/errors'
import { useQuery } from '@tanstack/react-query'

import { propose, proposalKeys } from './api'

/**
 * Two fields, and two sentences about what happens next.
 *
 * The title can arrive pre-filled from the empty state's suggestions, and it
 * stays editable — the suggestion is a way past a blank field, not a choice.
 *
 * Both notes are here rather than after publishing, because both change whether
 * somebody presses the button: it goes up with your name on it, and if it goes
 * ahead you are paid for it.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function NewIdeaScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const userId = useUserId()
  const client = useQueryClient()
  const [params] = useSearchParams()

  const [titol, setTitol] = useState(() => params.get('titol') ?? '')
  const [descripcio, setDescripcio] = useState('')

  const values = useQuery({ queryKey: doorKeys.pointValues(), queryFn: fetchPointValues })
  const reward = values.data?.find((v) => v.mena === 'motiu' && v.clau === 'propuso')?.punts ?? null

  const save = useMutation({
    mutationFn: () => propose(titol, descripcio, userId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: proposalKeys.list() })
      await navigate('/idees')
    },
  })

  // The CHECK on the column is 3 to 120. Mirrored here so the button is off
  // rather than the server saying no to something it could have said earlier.
  const clean = titol.trim()
  const valid = clean.length >= 3 && clean.length <= 120

  return (
    <main className="min-h-dvh bg-app pb-[calc(env(safe-area-inset-bottom,0px)+32px)]">
      <JuntaHeader to="/idees" label={t('ideas.title')} title={t('ideas.newTitle')} />

      <div className={`pt-8 ${GUTTER}`}>
        <h2 className="text-lg font-bold [text-wrap:balance]">{t('ideas.newHeading')}</h2>
        <p className="mt-4 pb-8 text-md text-fg-secondary [text-wrap:pretty]">
          {t('ideas.newLede')}
        </p>

        <Field label={t('ideas.newName')}>
          <input
            value={titol}
            onChange={(e) => {
              setTitol(e.target.value)
            }}
            maxLength={120}
            placeholder={t('ideas.newNamePlaceholder')}
            className={INPUT}
          />
        </Field>

        <Field label={t('ideas.newBody')}>
          <textarea
            value={descripcio}
            onChange={(e) => {
              setDescripcio(e.target.value)
            }}
            rows={4}
            maxLength={2000}
            placeholder={t('ideas.newBodyPlaceholder')}
            className={`${INPUT} resize-y`}
          />
        </Field>

        <p className="text-sm text-fg-muted [text-wrap:pretty]">{t('ideas.newPublic')}</p>
        {reward === null ? null : (
          <p className="mt-3 text-sm text-success [text-wrap:pretty]">
            {t('ideas.newPaid', { points: t('units.points', { count: reward }) })}
          </p>
        )}

        {save.isError ? (
          <p role="alert" className="pt-6 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(save.error))}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!valid || save.isPending}
          onClick={() => {
            save.mutate()
          }}
          className="mt-8 min-h-[56px] w-full bg-brand-cta px-8 text-lg font-bold text-on-brand [text-wrap:balance] disabled:opacity-50"
        >
          {save.isPending ? t('state.updating') : t('ideas.publish')}
        </button>

        <p className="mt-5 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
          {t('ideas.withdrawNote')}
        </p>
      </div>
    </main>
  )
}
