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

  // Qui obre «Proposa» ve a escriure, i aquesta pantalla competeix amb obrir
  // el grup de WhatsApp, que són zero tocs. Si el títol ja arriba posat des
  // d'una llavor, el cursor va on falta text.
  const [seeded] = useState(() => params.get('titol') !== null)

  const values = useQuery({ queryKey: doorKeys.pointValues(), queryFn: fetchPointValues })
  const reward = values.data?.find((v) => v.mena === 'motiu' && v.clau === 'propuso')?.punts ?? null

  const save = useMutation({
    // Sense això no s'executa gens sense cobertura, i és justament el cas
    // per al qual existeix. React Query, per defecte, posa les mutacions en
    // pausa quan `navigator.onLine` diu que no: no falla, no llança, no
    // crida `mutationFn` — no fa res. La cua d'IndexedDB viu a dins, o sigui
    // que la pausa se l'empassa sencera.
    networkMode: 'always',
    mutationFn: () => propose(titol, descripcio, userId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: proposalKeys.list() })
      await navigate('/idees')
    },
    // Offline is not a refusal. `propose` writes the idea to the queue before
    // it tries to send it, so it is safe on the phone either way and the list
    // is where the waiting count lives. Anything else — a policy saying no, a
    // title the CHECK refuses — stays on this screen with its reason.
    onError: () => {
      if (navigator.onLine) return
      void navigate('/idees')
    },
  })

  // The CHECK on the column is 3 to 120. Mirrored here so the button is off
  // rather than the server saying no to something it could have said earlier.
  const clean = titol.trim()
  const valid = clean.length >= 3 && clean.length <= 120

  return (
    <main className="with-tabbar min-h-dvh bg-app">
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
            // És el camp pel qual s'ha obert la pantalla, i no n'hi ha cap
            // altre abans.
            autoFocus={!seeded}
            enterKeyHint="next"
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
            // Amb el títol ja posat, el que falta d'escriure és això.
            autoFocus={seeded}
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
