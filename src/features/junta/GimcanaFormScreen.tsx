import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { eventKeys, fetchEvent } from '@/features/event/api'
import {
  fetchGimcana,
  fetchPeople,
  fetchTeams,
  gimcanaKeys,
  type ProvaDraft,
  saveGimcana,
  type TeamDraft,
  saveTeams,
  shuffleTeams,
} from '@/features/gimcana/api'
import { errorKey } from '@/lib/errors'
import { Confirm } from '@/ui/Confirm/Confirm'
import { DoneLine } from '@/ui/Notice/DoneLine'
import { NavRow } from '@/ui/Row/Row'

import { JuntaHeader } from './JuntaHeader'
import { useBack } from '@/lib/useBack'

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
// L'amplada va a part perquè els camps estrets no la poden treure: amb
// `w-full` a la base, el `w-[80px]` dels punts no s'aplicava mai —`.w-full`
// va després al full d'estils i guanya sigui quin sigui l'ordre del
// `className`— i a 390 px els punts ocupaven tota la fila i el títol de la
// prova quedava reduït a un quadradet buit.
const INPUT_BOX =
  'border border-[var(--ds-border-input)] bg-transparent px-7 py-6 text-md text-fg placeholder:text-fg-faint'

const MENES = ['escoles', 'junta', 'sorteig', 'lliure'] as const
type Mena = (typeof MENES)[number]

export function GimcanaFormScreen() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const { back } = useBack(`/junta/esdeveniment/${id}`)
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
  const [teamNames, setTeamNames] = useState<readonly TeamDraft[] | null>(null)
  const [howMany, setHowMany] = useState(3)
  const [confirmShuffle, setConfirmShuffle] = useState(false)

  const chosen: Mena = mena ?? existing?.mena_equips ?? 'escoles'
  const list: readonly ProvaDraft[] =
    proves ??
    (existing?.proves ?? []).map((p, i) => ({
      // L'`id` és el que fa que desar no s'emporti les fotos d'aquesta prova.
      id: p.id,
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

  // Per dir quants en queden per repartir a la fila que porta a fer-ho, i per
  // saber si remenar trepitjaria un repartiment fet a mà.
  const people = useQuery({
    queryKey: gimcanaKeys.people(existing?.id ?? ''),
    queryFn: () => fetchPeople(existing?.id ?? ''),
    enabled: existing !== null && existing.mena_equips !== 'escoles',
  })
  const placed = (people.data ?? []).filter((p) => p.equip_id !== null).length

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
      back()
    },
  })

  const shuffle = useMutation({
    mutationFn: () => shuffleTeams(existing?.id ?? '', howMany),
    onSuccess: async () => {
      setConfirmShuffle(false)
      setTeamNames(null)
      await client.invalidateQueries({ queryKey: gimcanaKeys.all() })
      await client.invalidateQueries({ queryKey: ['junta', 'gimcana'] })
    },
  })

  // Quanta gent es quedava sense equip en desar, per dir-ho després: «ningú
  // no ha canviat d'equip» seria mentida si se n'ha tret un amb gent.
  const named = useMutation({
    mutationFn: ({ equips }: { equips: readonly TeamDraft[]; orphaned: number }) =>
      saveTeams(existing?.id ?? '', equips),
    onSuccess: async (estat) => {
      // Desats: la llista torna a sortir del servidor, que és qui sap quins
      // noms han quedat (un nom en blanc torna com a «Equip N»).
      if (estat === 'desats') setTeamNames(null)
      await client.invalidateQueries({ queryKey: gimcanaKeys.all() })
      await client.invalidateQueries({ queryKey: ['junta', 'gimcana'] })
    },
  })

  // Cada fila porta l'`id` del seu equip: és el que fa que treure'n un del mig
  // no passi la gent d'un equip a un altre. Un equip sense nom surt buit, amb
  // «Equip N» de placeholder, i no amb el número escrit: desar-lo l'hauria
  // convertit en un nom de debò, que ja no seguiria el número si l'ordre canvia.
  const names: readonly TeamDraft[] =
    teamNames ?? (teams.data ?? []).map((team) => ({ id: team.id, nom: team.nom ?? '' }))

  // Qui es quedarà sense equip si es desa la llista tal com està. Treure un
  // equip amb gent no està prohibit —potser s'han de fusionar—, però no es pot
  // fer sense saber-ho.
  const kept = new Set(names.map((n) => n.id))
  const orphaned = (teams.data ?? [])
    .filter((team) => !kept.has(team.id))
    .reduce((sum, team) => sum + team.quants, 0)

  return (
    <main className="min-h-dvh bg-app pb-10">
      <JuntaHeader
        viaHistory
        to={`/junta/esdeveniment/${id}`}
        label={t('junta.gimcana.leave')}
        className="lg:hidden"
      />

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
                aria-label={t('junta.gimcana.shuffleHowMany')}
                value={howMany}
                onChange={(e) => {
                  setHowMany(Number(e.target.value))
                }}
                className={`${INPUT_BOX} tabular w-[92px] flex-none`}
              />
              <button
                type="button"
                disabled={shuffle.isPending || confirmShuffle}
                onClick={() => {
                  // Remenar refà tots els equips. Si ja hi ha gent posada —a mà
                  // o per un sorteig anterior—, es pregunta abans de perdre-ho.
                  if (placed > 0) setConfirmShuffle(true)
                  else shuffle.mutate()
                }}
                className="flex min-h-[50px] flex-1 items-center justify-center border-[1.5px] border-surface-7 px-6 py-5 text-md font-bold text-fg-secondary [text-wrap:balance] disabled:opacity-60"
              >
                {t('junta.gimcana.shuffle')}
              </button>
            </div>
            {confirmShuffle ? (
              <Confirm
                className="mt-5"
                cta={t('junta.gimcana.shuffleAnyway')}
                cancel={t('junta.gimcana.leave')}
                busy={shuffle.isPending}
                onConfirm={() => {
                  shuffle.mutate()
                }}
                onCancel={() => {
                  setConfirmShuffle(false)
                }}
              >
                <p className="text-sm text-fg-muted [text-wrap:pretty]">
                  {t('junta.gimcana.shuffleConfirm', { count: placed })}
                </p>
              </Confirm>
            ) : null}
            {/* `.data === 'ja_jugada'` és el refús que arriba com a èxit; això és
                el fracàs de debò. Sense la segona línia, un nom d'equip buit o
                un nombre fora de rang no deixaven cap senyal a la pantalla. */}
            {shuffle.data === 'ja_jugada' ? (
              <p role="alert" className="mt-5 text-md font-bold text-warning [text-wrap:pretty]">
                {t('junta.gimcana.alreadyPlayed')}
              </p>
            ) : null}
            {shuffle.isError ? (
              <p role="alert" className="mt-5 text-md font-bold text-error [text-wrap:pretty]">
                {t(errorKey(shuffle.error))}
              </p>
            ) : null}
            <p className="mt-5 text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
              {t('junta.gimcana.shuffleNote')}
            </p>
          </div>
        ) : null}

        {/* Els noms també després d'un sorteig: hi neixen sense nom, i des de
            la migració 97 posar-n'hi no mou ningú. Només amb el mode desat:
            amb un mode triat i encara no desat, els equips de sota serien els
            de l'altre mode. */}
        {existing !== null && chosen !== 'escoles' && chosen === existing.mena_equips ? (
          <div className="mt-7 border border-surface-5 bg-surface-1 px-8 py-7">
            <p className="text-base font-bold">{t('junta.gimcana.namesTitle')}</p>
            <div className="mt-5 grid gap-4">
              {names.map((n, i) => (
                <div key={n.id ?? `nou-${String(i)}`} className="flex items-center gap-3">
                  <input
                    type="text"
                    value={n.nom}
                    maxLength={40}
                    aria-label={t('junta.gimcana.teamLabel', { n: i + 1 })}
                    placeholder={t('junta.gimcana.teamLabel', { n: i + 1 })}
                    onChange={(e) => {
                      const next = [...names]
                      next[i] = { ...n, nom: e.target.value }
                      setTeamNames(next)
                    }}
                    className={`${INPUT_BOX} min-w-0 flex-1`}
                  />
                  {/* Surt de la llista ara i s'esborra en desar, i només si no
                      té cap foto. La gent dels altres equips no es mou. */}
                  <button
                    type="button"
                    aria-label={t('junta.gimcana.removeTeam', { n: i + 1 })}
                    onClick={() => {
                      setTeamNames(names.filter((_, j) => j !== i))
                    }}
                    className="flex min-h-[44px] min-w-[44px] flex-none items-center justify-center text-2xl text-fg-muted"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setTeamNames([...names, { nom: '' }])
                }}
                className="flex min-h-[50px] items-center justify-center border-[1.5px] border-surface-7 px-7 py-5 text-md font-bold text-fg-secondary"
              >
                {t('junta.gimcana.addTeam')}
              </button>
            </div>
            {orphaned > 0 ? (
              <p className="mt-5 text-sm font-bold text-[var(--ds-warning-deep)] [text-wrap:pretty]">
                {t('junta.gimcana.willOrphan', { count: orphaned })}
              </p>
            ) : null}
            <button
              type="button"
              disabled={named.isPending}
              onClick={() => {
                named.mutate({ equips: names, orphaned })
              }}
              className="mt-5 flex min-h-[50px] w-full items-center justify-center border-[1.5px] border-surface-7 px-7 py-5 text-md font-bold text-fg-secondary disabled:opacity-60"
            >
              {t('junta.gimcana.saveTeams')}
            </button>
            {named.data === 'equip_amb_fotos' ? (
              <p role="alert" className="mt-5 text-md font-bold text-warning [text-wrap:pretty]">
                {t('junta.gimcana.teamHasPhotos')}
              </p>
            ) : null}
            <DoneLine
              className="mt-5"
              message={
                named.data !== 'desats' || teamNames !== null
                  ? null
                  : (named.variables?.orphaned ?? 0) > 0
                    ? t('junta.gimcana.teamsSavedOrphaned', { count: named.variables?.orphaned ?? 0 })
                    : t('junta.gimcana.teamsSaved')
              }
            />
            {named.isError ? (
              <p role="alert" className="mt-5 text-md font-bold text-error [text-wrap:pretty]">
                {t(errorKey(named.error))}
              </p>
            ) : null}
          </div>
        ) : null}

        {existing !== null && existing.mena_equips !== 'escoles' && chosen === existing.mena_equips ? (
          <NavRow
            to={`/junta/esdeveniment/${id}/gimcana/equips`}
            title={t('junta.gimcana.teamsTitle')}
            sub={
              people.data === undefined
                ? t('junta.gimcana.teamsRowLead')
                : t('junta.gimcana.teamsRowSub', { done: placed, total: people.data.length })
            }
            className="mt-6 border-t"
          />
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
                aria-label={t('junta.gimcana.provaLabel', { n: i + 1 })}
                placeholder={t('junta.gimcana.provaPlaceholder')}
                onChange={(e) => {
                  const next = [...list]
                  next[i] = { ...p, titol: e.target.value }
                  setProves(next)
                }}
                className={`${INPUT_BOX} min-w-0 flex-1`}
              />
              <input
                type="number"
                min={0}
                max={100}
                aria-label={t('junta.gimcana.provaPuntsLabel', { n: i + 1 })}
                value={p.punts}
                onChange={(e) => {
                  const next = [...list]
                  next[i] = { ...p, punts: Number(e.target.value) }
                  setProves(next)
                }}
                className={`${INPUT_BOX} tabular w-[80px] flex-none`}
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
