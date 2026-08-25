import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchPeriods, rankingKeys } from '@/features/ranking/api'
import { APP_TIME_ZONE } from '@/i18n/format'
import { errorKey } from '@/lib/errors'

import { chainFromPeriods, periodsFromChain, savePeriods } from './configApi'
import { Field, INPUT } from './formBits'
import { JuntaHeader } from './JuntaHeader'

/**
 * When each term starts.
 *
 * Edited as a chain and not as four rows with two dates each, because the end
 * of one term IS the start of the next and two fields for one date is how a
 * gap or an overlap gets typed. An overlap counts the same points in two
 * terms; a gap makes them vanish from every term while staying in the course
 * total, which is the worse of the two because nothing looks broken.
 *
 * Migration 24 refuses both. This is the half that means nobody has to find
 * out about the refusal.
 */
function PeriodsBlock() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [edits, setEdits] = useState<string[] | null>(null)
  const [saved, setSaved] = useState(false)

  const periods = useQuery({ queryKey: rankingKeys.periods(), queryFn: fetchPeriods })
  const rows = periods.data ?? []
  const trams = rows.filter((p) => p.mena === 'tram').sort((a, b) => a.ordre - b.ordre)
  const chain = edits ?? chainFromPeriods(rows, APP_TIME_ZONE)

  // Contiguity comes free from editing a chain: one date does both jobs. What
  // is left is that they run forwards and none is blank.
  const ordered = chain.every((d, i) => d !== '' && (i === 0 || d > (chain[i - 1] ?? '')))

  const save = useMutation({
    mutationFn: async () => {
      const next = periodsFromChain(rows, chain, APP_TIME_ZONE)
      if (next === null) throw new Error('chain')
      await savePeriods(next)
    },
    onSuccess: async () => {
      setEdits(null)
      setSaved(true)
      // The ranking holds these for half an hour, so without this the chips
      // above everybody's leaderboard keep the old calendar until they close
      // the app — including the person who just changed it.
      await client.invalidateQueries({ queryKey: rankingKeys.periods() })
      await client.invalidateQueries({ queryKey: ['ranking'] })
    },
  })

  if (periods.isPending) return <p className="text-fg-muted">{t('state.loading')}</p>
  if (periods.isError) {
    return (
      <p role="alert" className="text-md font-bold text-error [text-wrap:pretty]">
        {t(errorKey(periods.error))}
      </p>
    )
  }
  if (trams.length === 0) {
    return (
      <p className="text-md text-fg-muted [text-wrap:pretty]">{t('junta.config.periods.none')}</p>
    )
  }

  return (
    <>
      <p className="pb-8 text-md text-fg-secondary [text-wrap:pretty]">
        {t('junta.config.periods.lede')}
      </p>

      {chain.map((day, index) => {
        const tram = trams[index]
        const label =
          tram === undefined
            ? t('junta.config.periods.ends')
            : t(index === 0 ? 'junta.config.periods.startsCourse' : 'junta.config.periods.starts', {
                // The chip's own name where there is one, its translation
                // where there is not — the same fallback the ranking uses.
                label: t(`ranking.period.${tram.codi}`, {
                  defaultValue: tram.etiqueta ?? tram.codi,
                }),
              })
        return (
          <Field key={tram?.codi ?? 'fi'} label={label}>
            <input
              type="date"
              value={day}
              onChange={(e) => {
                setSaved(false)
                setEdits(chain.map((d, i) => (i === index ? e.target.value : d)))
              }}
              className={INPUT}
            />
          </Field>
        )
      })}

      {ordered ? null : (
        <p
          role="alert"
          className="pb-6 text-md font-bold text-[var(--ds-warning)] [text-wrap:pretty]"
        >
          {t('junta.config.periods.outOfOrder')}
        </p>
      )}

      {save.isError ? (
        <p role="alert" className="pb-6 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(save.error))}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!ordered || edits === null || save.isPending}
        onClick={() => {
          save.mutate()
        }}
        className="min-h-[52px] w-full bg-brand-cta px-8 text-lg font-bold text-on-brand [text-wrap:balance] disabled:opacity-50"
      >
        {save.isPending ? t('state.updating') : t('actions.save')}
      </button>

      {saved && edits === null ? (
        <p role="status" className="pt-5 text-md font-bold text-success">
          {t('junta.config.saved')}
        </p>
      ) : null}
    </>
  )
}

const GUTTER = 'px-[var(--ds-gutter)]'

export function PeriodsScreen() {
  const { t } = useTranslation()
  return (
    <main className="min-h-dvh bg-app pb-[calc(var(--ds-safe-bottom)+32px)]">
      <JuntaHeader
        to="/junta"
        label={t('junta.back')}
        title={t('junta.config.periods.title')}
        className="lg:hidden"
      />
      <div className={`pt-8 ${GUTTER}`}>
        <PeriodsBlock />
      </div>
    </main>
  )
}
