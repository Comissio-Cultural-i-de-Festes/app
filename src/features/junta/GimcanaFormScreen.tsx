import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { eventKeys, fetchEvent } from '@/features/event/api'
import {
  fetchGimcana,
  fetchTeams,
  gimcanaKeys,
  type ProvaDraft,
  saveGimcana,
  saveTeams,
  shuffleTeams,
} from '@/features/gimcana/api'
import { errorKey } from '@/lib/errors'

import { JuntaHeader } from './JuntaHeader'
import { teamName } from '@/features/gimcana/teamName'

/**
 * Muntar la gimcana, des de dins de l'activitat.
 *
 * Penja de la festa: es destapa quan comenci i es tanca quan acabi, sense cap
 * interruptor que algú s'hagi de recordar de moure la nit que hi ha dues-centes
 * persones esperant.
 *
 * ELS EQUIPS SÓN QUATRE MANERES I NO UNA. Les tres escoles no necessiten
 * configurar res i no deixen ningú fora; les altres tres es fan aquí. Aquesta
 * part no la va dibuixar el dissenyador —el brief li deia que els equips eren
 * les escoles— i està feta amb la forma de llista editable que ja tenen els
 * graus i els períodes.
 */

const GUTTER = 'px-[var(--ds-gutter)]'
const INPUT =
  'w-full border border-[var(--ds-border-input)] bg-transparent px-7 py-6 text-md text-fg placeholder:text-fg-faint'

const MENES = ['escoles', 'junta', 'sorteig', 'lliure'] as const
type Mena = (typeof MENES)[number]

export function GimcanaFormScreen() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const client = useQueryClient()

  const event = useQuery({
    queryKey: eventKeys.one(id),
    queryFn: () => fetchEvent(id),
    enabled: id !== '',
  })

  const gimcana = useQuery({
    queryKey: gimcanaKeys.one(id),
    queryFn: () => fetchGimcana(id),
    enabled: id !== '',
  })
  const existing = gimcana.data?.estat === 'oberta' ? gimcana.data : null

  const [mena, setMena] = useState<Mena | null>(null)
  const [proves, setProves] = useState<readonly ProvaDraft[] | null>(null)
  const [teamNames, setTeamNames] = useState<readonly string[] | null>(null)
  const [howMany, setHowMany] = useState(3)

  const chosen: Mena = mena ?? existing?.mena_equips ?? 'escoles'
  const list: readonly ProvaDraft[] =
    proves ??
    (existing?.proves ?? []).map((p, i) => ({
      titol: p.titol,
      descripcio: p.descripcio ?? '',
      punts: p.punts,
      ordre: i + 1,
    }))

  const teams = useQuery({
    queryKey: gimcanaKeys.teams(existing?.id ?? ''),
    queryFn: () => fetchTeams(existing?.id ?? ''),
    enabled: existing !== null && chosen !== 'escoles',
  })

  const save = useMutation({
    mutationFn: () =>
      saveGimcana(
        id,
        chosen,
        null,
        list.map((p, i) => ({ ...p, ordre: i + 1 })),
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: gimcanaKeys.all() })
      void navigate(`/junta/esdeveniment/${id}`)
    },
  })

  const shuffle = useMutation({
    mutationFn: () => shuffleTeams(existing?.id ?? '', howMany),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: gimcanaKeys.all() })
    },
  })

  const named = useMutation({
    mutationFn: () => saveTeams(existing?.id ?? '', teamNames ?? []),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: gimcanaKeys.all() })
    },
  })

  const names: readonly string[] =
    teamNames ?? (teams.data ?? []).map((team, i) => teamName(team, i, t))

  return (
    <main className="min-h-dvh bg-app pb-10">
      <JuntaHeader to={`/junta/esdeveniment/${id}`} label={t('junta.gimcana.leave')} />

      <div className={GUTTER}>
        <h1 className="display text-d-s tracking-[-0.045em]">{t('gimcana.title')}</h1>
        <p className="mt-5 text-sm text-fg-muted [text-wrap:pretty]">
          {t('junta.gimcana.lead', { event: event.data?.titulo ?? '' })}
        </p>

        {/* ── com es fan els equips ── */}
        <p className="eyebrow-sm mt-10">{t('junta.gimcana.teamsHow')}</p>
        <div className="mt-4 grid gap-4">
          {MENES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={chosen === m}
              onClick={() => {
                setMena(m)
              }}
              className={
                'min-h-[44px] px-7 py-6 text-left ' +
                (chosen === m
                  ? 'selected--soft text-fg'
                  : 'border border-surface-5 text-fg-secondary')
              }
            >
              <span className="block text-base font-bold">{t(`junta.gimcana.mena.${m}`)}</span>
              <span className="mt-1 block text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
                {t(`junta.gimcana.menaSub.${m}`)}
              </span>
            </button>
          ))}
        </div>

        {/* Els equips concrets només tenen sentit un cop la gimcana existeix:
            fins que no es desa no hi ha res a què penjar-los. */}
        {existing !== null && chosen === 'sorteig' ? (
          <div className="mt-7 border border-surface-5 bg-surface-1 px-8 py-7">
            <p className="text-base font-bold">{t('junta.gimcana.shuffleTitle')}</p>
            <div className="mt-5 flex items-center gap-5">
              <input
                type="number"
                min={2}
                max={12}
                value={howMany}
                onChange={(e) => {
                  setHowMany(Number(e.target.value))
                }}
                className={`${INPUT} tabular w-[92px]`}
              />
              <button
                type="button"
                disabled={shuffle.isPending}
                onClick={() => {
                  shuffle.mutate()
                }}
                className="flex min-h-[50px] flex-1 items-center justify-center border-[1.5px] border-surface-7 px-6 py-5 text-md font-bold text-fg-secondary [text-wrap:balance] disabled:opacity-60"
              >
                {t('junta.gimcana.shuffle')}
              </button>
            </div>
            {shuffle.data === 'ja_jugada' ? (
              <p role="alert" className="mt-5 text-md font-bold text-warning [text-wrap:pretty]">
                {t('junta.gimcana.alreadyPlayed')}
              </p>
            ) : null}
            <p className="mt-5 text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
              {t('junta.gimcana.shuffleNote')}
            </p>
          </div>
        ) : null}

        {existing !== null && (chosen === 'junta' || chosen === 'lliure') ? (
          <div className="mt-7 border border-surface-5 bg-surface-1 px-8 py-7">
            <p className="text-base font-bold">{t('junta.gimcana.namesTitle')}</p>
            <div className="mt-5 grid gap-4">
              {names.map((n, i) => (
                <input
                  key={i}
                  type="text"
                  value={n}
                  maxLength={40}
                  onChange={(e) => {
                    const next = [...names]
                    next[i] = e.target.value
                    setTeamNames(next)
                  }}
                  className={INPUT}
                />
              ))}
              <button
                type="button"
                onClick={() => {
                  setTeamNames([...names, ''])
                }}
                className="flex min-h-[50px] items-center justify-center border-[1.5px] border-surface-7 px-7 py-5 text-md font-bold text-fg-secondary"
              >
                {t('junta.gimcana.addTeam')}
              </button>
            </div>
            <button
              type="button"
              disabled={named.isPending}
              onClick={() => {
                named.mutate()
              }}
              className="mt-5 flex min-h-[50px] w-full items-center justify-center border-[1.5px] border-surface-7 px-7 py-5 text-md font-bold text-fg-secondary disabled:opacity-60"
            >
              {t('junta.gimcana.saveTeams')}
            </button>
            {named.data === 'ja_jugada' ? (
              <p role="alert" className="mt-5 text-md font-bold text-warning [text-wrap:pretty]">
                {t('junta.gimcana.alreadyPlayed')}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* ── les proves ── */}
        <p className="eyebrow-sm mt-10">{t('junta.gimcana.proves')}</p>
        <div className="mt-4 grid gap-4">
          {list.map((p, i) => (
            <div key={i} className="flex items-center gap-5">
              <input
                type="text"
                value={p.titol}
                maxLength={120}
                placeholder={t('junta.gimcana.provaPlaceholder')}
                onChange={(e) => {
                  const next = [...list]
                  next[i] = { ...p, titol: e.target.value }
                  setProves(next)
                }}
                className={`${INPUT} min-w-0 flex-1`}
              />
              <input
                type="number"
                min={0}
                max={100}
                value={p.punts}
                onChange={(e) => {
                  const next = [...list]
                  next[i] = { ...p, punts: Number(e.target.value) }
                  setProves(next)
                }}
                className={`${INPUT} tabular w-[80px] flex-none`}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              setProves([...list, { titol: '', descripcio: '', punts: 10, ordre: list.length + 1 }])
            }}
            className="flex min-h-[50px] items-center justify-center border-[1.5px] border-surface-7 px-7 py-5 text-md font-bold text-fg-secondary"
          >
            {t('junta.gimcana.addProva')}
          </button>
        </div>
        <p className="mt-5 text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
          {t('junta.gimcana.provesNote')}
        </p>

        <button
          type="button"
          disabled={save.isPending}
          onClick={() => {
            save.mutate()
          }}
          className="mt-10 flex min-h-[56px] w-full items-center justify-center bg-brand-cta px-9 py-7 text-xl font-bold text-on-brand [text-wrap:balance] disabled:opacity-60"
        >
          {t('junta.gimcana.publish')}
        </button>

        {save.isError ? (
          <p role="alert" className="mt-5 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(save.error))}
          </p>
        ) : null}

        <p className="mt-6 text-sm text-fg-muted-lo [text-wrap:pretty]">
          {t('junta.gimcana.publishNote')}
        </p>
      </div>
    </main>
  )
}
