import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import {
  fetchPeople,
  fetchTeams,
  gimcanaKeys,
  type PersonRow,
  setTeam,
  type TeamRow,
} from '@/features/gimcana/api'
import { teamName } from '@/features/gimcana/teamName'
import { SendNote } from '@/features/shell/SendNote'
import { errorKey } from '@/lib/errors'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { countByTeam, tapTarget, visiblePeople, withTeam } from './teamsBoard'

/**
 * Qui va a cada equip: la junta tria un equip a dalt i toca els noms.
 *
 * NO HI HA BOTÓ DE DESAR. Cada toc es desa sol i la fila canvia a l'instant,
 * abans que contesti el servidor; si el servidor diu que no, la fila torna on
 * era i es diu per què. Un botó de desar al final d'una llista de quaranta
 * és el que fa que algú tanqui la pantalla pensant que ja estava.
 *
 * L'ÚLTIM CANVI ES POT DESFER. Amb el mòbil a una mà i la llista que es mou
 * sota el dit, un toc a la fila del costat és el més fàcil del món. La franja
 * de dalt diu què ha passat i el desfà d'un toc, que és el patró de la porta.
 *
 * ELS CANVIS VAN D'UN EN UN (`scope`). Tocar tres noms seguits són tres crides,
 * i sense cua la segona podria arribar abans que la primera; amb una fila
 * tocada dues vegades, l'estat final seria el del toc que ha arribat tard.
 *
 * L'equip de cadascú no es demana a `gimcana_for_event`: en mode sorteig
 * aquella crida posa a un equip qui la fa, i la junta no és qui juga aquí.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

interface LastChange {
  readonly userId: string
  readonly nombre: string
  readonly from: string | null
  readonly to: string | null
  readonly undone: boolean
}

interface Move {
  readonly userId: string
  readonly to: string | null
}

export function GimcanaTeamsBlock({
  gimcanaId,
  eventId,
  header,
}: {
  readonly gimcanaId: string
  readonly eventId: string
  /** La capçalera de la pantalla, que s'enganxa a dalt amb la barra d'equips. */
  readonly header: ReactNode
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const peopleKey = gimcanaKeys.people(gimcanaId)
  const moveKey = ['junta', 'gimcana', 'set-team', gimcanaId] as const

  const teams = useQuery({
    queryKey: gimcanaKeys.teams(gimcanaId),
    queryFn: () => fetchTeams(gimcanaId),
  })
  const people = useQuery({
    queryKey: peopleKey,
    queryFn: () => fetchPeople(gimcanaId),
  })

  const [chosen, setChosen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [onlyFree, setOnlyFree] = useState(false)
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [last, setLast] = useState<LastChange | null>(null)
  const [refused, setRefused] = useState(false)

  const teamList: readonly TeamRow[] = teams.data ?? []
  // L'equip actiu és el triat si encara existeix; si no, el primer. Un equip
  // que la junta acaba d'esborrar al formulari no pot quedar-se seleccionat.
  const active = teamList.find((team) => team.id === chosen)?.id ?? teamList[0]?.id ?? null

  const nameOf = (equipId: string | null): string => {
    if (equipId === null) return t('junta.gimcana.noTeam')
    const i = teamList.findIndex((team) => team.id === equipId)
    const team = teamList[i]
    return team === undefined ? t('junta.gimcana.noTeam') : teamName(team, i, t)
  }

  const move = useMutation({
    mutationKey: moveKey,
    scope: { id: `gimcana-set-team-${gimcanaId}` },
    mutationFn: ({ userId, to }: Move) => setTeam(gimcanaId, userId, to),
    onMutate: async ({ userId, to }: Move) => {
      await client.cancelQueries({ queryKey: peopleKey })
      const before =
        client.getQueryData<PersonRow[]>(peopleKey)?.find((p) => p.user_id === userId)
          ?.equip_id ?? null
      client.setQueryData<PersonRow[]>(peopleKey, (rows) =>
        rows === undefined ? rows : withTeam(rows, userId, to),
      )
      setPending((s) => new Set(s).add(userId))
      return { before }
    },
    onSuccess: (estat, { userId }, ctx) => {
      // `no_hi_es` / `no_es_tria`: l'equip ja no hi és o la gimcana ha canviat
      // de mode mentre es mirava. Arriba com a èxit i no ho és.
      if (estat !== 'fet') {
        client.setQueryData<PersonRow[]>(peopleKey, (rows) =>
          rows === undefined ? rows : withTeam(rows, userId, ctx?.before ?? null),
        )
        setRefused(true)
        setLast(null)
        void client.invalidateQueries({ queryKey: gimcanaKeys.teams(gimcanaId) })
      }
    },
    onError: (_err, { userId }, ctx) => {
      if (ctx === undefined) return
      client.setQueryData<PersonRow[]>(peopleKey, (rows) =>
        rows === undefined ? rows : withTeam(rows, userId, ctx.before),
      )
      setLast(null)
    },
    onSettled: (_data, _err, { userId }) => {
      setPending((s) => {
        const next = new Set(s)
        next.delete(userId)
        return next
      })
      // Només quan s'ha buidat la cua: refrescar amb canvis encara en camí
      // portaria la llista del servidor d'abans i la fila tornaria enrere un
      // instant abans de tornar endavant.
      if (client.isMutating({ mutationKey: moveKey }) <= 1) {
        void client.invalidateQueries({ queryKey: peopleKey })
        void client.invalidateQueries({ queryKey: gimcanaKeys.all() })
      }
    },
  })

  const tap = (person: PersonRow): void => {
    if (active === null) return
    const to = tapTarget(person, active)
    setRefused(false)
    setLast({ userId: person.user_id, nombre: person.nombre, from: person.equip_id, to, undone: false })
    move.mutate({ userId: person.user_id, to })
  }

  const undo = (): void => {
    if (last === null || last.undone) return
    setRefused(false)
    setLast({ ...last, undone: true })
    move.mutate({ userId: last.userId, to: last.from })
  }

  const rows = people.data ?? []
  const counts = countByTeam(rows)
  const free = counts.get(null) ?? 0
  const shown = visiblePeople(rows, query, onlyFree)

  return (
    <>
      <div className="sticky top-[var(--ds-sticky-top)] z-20 bg-app">
        {header}

        {teamList.length === 0 ? null : (
          <div className={`border-b border-surface-5 pt-5 pb-6 ${GUTTER}`}>
            <p id="equip-actiu" className="eyebrow-sm text-fg-muted">
              {t('junta.gimcana.activeTeam')}
            </p>
            <div
              role="group"
              aria-labelledby="equip-actiu"
              className={
                'mt-4 grid items-stretch gap-[6px] ' +
                (teamList.length <= 3 ? 'auto-cols-fr grid-flow-col' : 'grid-cols-2')
              }
            >
              {teamList.map((team, i) => {
                const on = team.id === active
                return (
                  <button
                    key={team.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setChosen(team.id)
                    }}
                    className={
                      'flex min-h-[56px] flex-col items-center justify-center px-4 py-4 text-center ' +
                      (on
                        ? 'bg-brand-cta text-on-brand'
                        : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg-secondary')
                    }
                  >
                    <span className="text-md font-bold [text-wrap:balance] [overflow-wrap:anywhere]">
                      {teamName(team, i, t)}
                    </span>
                    <span
                      className={
                        'tabular mt-1 text-sm-lo font-semibold ' +
                        (on ? 'text-on-brand' : 'text-fg-muted-lo')
                      }
                    >
                      {t('gimcana.pick.people', { count: counts.get(team.id) ?? 0 })}
                    </span>
                  </button>
                )
              })}
            </div>

            {last === null ? null : (
              <div
                role="status"
                aria-live="polite"
                className={
                  'mt-5 flex min-h-[44px] items-center gap-5 border-[1.5px] px-6 ' +
                  (last.undone
                    ? 'border-surface-6 bg-surface-1'
                    : 'border-[var(--ds-success)] bg-[var(--ds-bg-live)]')
                }
              >
                <p
                  className={
                    'min-w-0 flex-1 py-3 text-md font-bold [text-wrap:pretty] ' +
                    (last.undone ? 'text-fg-muted' : 'text-fg')
                  }
                >
                  {last.undone
                    ? t('junta.gimcana.undone', { name: last.nombre, team: nameOf(last.from) })
                    : last.to === null
                      ? t('junta.gimcana.removed', { name: last.nombre })
                      : t('junta.gimcana.movedTo', { name: last.nombre, team: nameOf(last.to) })}
                </p>
                {last.undone ? null : (
                  <button
                    type="button"
                    onClick={undo}
                    className="-mr-3 flex min-h-[44px] flex-none items-center px-3 text-[13px] font-extrabold tracking-[0.06em] text-success uppercase"
                  >
                    {t('actions.undo')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={GUTTER}>
        {/* Sense xarxa, en pausa o lent, i també l'error: `SendNote` ja diu
            les quatre coses, i una segona línia d'error aquí les repetia. */}
        <SendNote send={move} className="mt-6" />
        {refused ? (
          <p role="alert" className="mt-6 text-md font-bold text-warning [text-wrap:pretty]">
            {t('junta.gimcana.teamsStale')}
          </p>
        ) : null}
      </div>

      {teams.isPending || people.isPending ? (
        <Skeleton className="mt-6">
          {[0, 1, 2, 3, 4].map((n) => (
            <div key={n} className={`flex items-center gap-5 border-b border-surface-4 py-6 ${GUTTER}`}>
              <SkeletonBar w="w-[26px]" h="h-[26px]" className="rounded-full" />
              <SkeletonBar w="w-[36px]" h="h-[36px]" className="rounded-full" />
              <span className="flex-1">
                <SkeletonBar w="w-[55%]" h="h-[14px]" />
                <SkeletonBar w="w-[35%]" h="h-[10px]" className="mt-3" />
              </span>
            </div>
          ))}
        </Skeleton>
      ) : teams.isError || people.isError ? (
        <p role="alert" className={`mt-6 text-md font-bold text-error [text-wrap:pretty] ${GUTTER}`}>
          {t(errorKey(teams.error ?? people.error))}
        </p>
      ) : teamList.length === 0 ? (
        <div className={`mt-8 ${GUTTER}`}>
          <p className="text-md text-fg-muted [text-wrap:pretty]">
            {t('junta.gimcana.noTeamsYet')}
          </p>
          <Link
            to={`/junta/esdeveniment/${eventId}/gimcana`}
            className="-ml-2 mt-4 inline-flex min-h-[44px] items-center px-2 text-md font-bold text-brand-label"
          >
            {t('junta.gimcana.makeTeams')}
          </Link>
        </div>
      ) : rows.length === 0 ? (
        <p className={`mt-8 text-md text-fg-muted [text-wrap:pretty] ${GUTTER}`}>
          {t('junta.gimcana.nobody')}
        </p>
      ) : (
        <>
          <div className={`mt-6 ${GUTTER}`}>
            <p className="text-sm text-fg-muted [text-wrap:pretty]">{t('junta.gimcana.teamsLead')}</p>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
              }}
              type="search"
              enterKeyHint="search"
              aria-label={t('junta.gimcana.search')}
              placeholder={t('junta.gimcana.search')}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="mt-5 min-h-[50px] w-full border-[1.5px] border-surface-7 bg-surface-1 px-[14px] py-[13px] text-lg font-semibold text-fg outline-none focus:border-brand-strong placeholder:font-medium placeholder:text-fg-faint"
            />
            <div className="mt-4 grid auto-cols-fr grid-flow-col gap-[6px]">
              {[false, true].map((only) => (
                <button
                  key={String(only)}
                  type="button"
                  aria-pressed={onlyFree === only}
                  onClick={() => {
                    setOnlyFree(only)
                  }}
                  className={
                    'flex min-h-[46px] items-center justify-center px-4 py-3 text-md font-bold [text-wrap:balance] ' +
                    (onlyFree === only
                      ? 'bg-brand-cta text-on-brand'
                      : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg-secondary')
                  }
                >
                  {only
                    ? t('junta.gimcana.filterFree', { n: free })
                    : t('junta.gimcana.filterAll', { n: rows.length })}
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <p className={`mt-8 text-md text-fg-muted [text-wrap:pretty] ${GUTTER}`}>
              {onlyFree && query.trim() === ''
                ? t('junta.gimcana.allPlaced')
                : t('junta.gimcana.noMatch')}
            </p>
          ) : (
            <ul className="mt-5 border-t border-surface-4">
              {shown.map((person) => {
                const on = person.equip_id !== null && person.equip_id === active
                const busy = pending.has(person.user_id)
                const sub = [
                  nameOf(person.equip_id),
                  person.ha_arribat ? t('junta.gimcana.arrived') : t('junta.gimcana.notArrived'),
                  person.fotos > 0 ? t('junta.gimcana.photos', { count: person.fotos }) : null,
                ]
                  .filter((s): s is string => s !== null)
                  .join(' · ')
                return (
                  <li key={person.user_id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        tap(person)
                      }}
                      className={
                        'flex min-h-[64px] w-full items-center gap-5 border-b border-surface-4 py-5 text-left ' +
                        `${GUTTER} ` +
                        (on ? 'bg-surface-3' : '')
                      }
                    >
                      <span
                        aria-hidden="true"
                        className={
                          'flex size-[26px] flex-none items-center justify-center rounded-full text-sm font-extrabold ' +
                          (on
                            ? 'bg-brand-cta text-on-brand'
                            : 'border-[1.5px] border-[var(--ds-border-input)] text-transparent')
                        }
                      >
                        ✓
                      </span>
                      <Avatar src={person.avatar_url} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold text-fg [overflow-wrap:anywhere]">
                          {person.nombre}
                        </span>
                        <span
                          className={
                            'mt-[3px] block text-sm-lo [text-wrap:pretty] ' +
                            (person.equip_id === null ? 'text-[var(--ds-warning-deep)]' : 'text-fg-muted')
                          }
                        >
                          {sub}
                        </span>
                      </span>
                      {busy ? (
                        <span className="flex-none text-xs-lo font-semibold text-fg-muted-lo">
                          {t('junta.gimcana.saving')}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <p className={`py-8 text-sm-lo text-fg-muted-lo [text-wrap:pretty] ${GUTTER}`}>
            {t('junta.gimcana.movingNote')}
          </p>
        </>
      )}
    </>
  )
}
