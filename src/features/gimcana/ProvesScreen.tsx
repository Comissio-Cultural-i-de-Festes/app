import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { eventKeys, fetchEvent } from '@/features/event/api'
import { JuntaHeader } from '@/features/junta/JuntaHeader'
import { errorKey } from '@/lib/errors'

import { fetchBoard, fetchGimcana, fetchTeams, gimcanaKeys, pickTeam } from './api'
import { teamName } from './teamName'
import { useProvesQueue } from './useProvesQueue'

/**
 * Les proves d'una nit.
 *
 * L'ESTAT D'UNA PROVA ÉS DEL TEU EQUIP, no teu. Si un company ja l'ha feta, ja
 * està feta: cinc persones enviant la mateixa foto no multipliquen els punts, i
 * la pantalla ho ha de dir abans que algú perdi deu minuts fent-la.
 *
 * I DIU QUANTES N'HI HA A LA CUA. La junta valida abans de puntuar —decisió
 * presa— i el cost és que el marcador va un pas enrere. Amagar-ho faria que
 * semblés que la teva prova s'ha perdut; dir-ho fa que s'entengui.
 */

const GUTTER = 'px-[var(--ds-gutter)]'
const ROW = 'flex items-center gap-5 border-b border-surface-4 py-7 px-[var(--ds-gutter)]'

export function ProvesScreen() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const client = useQueryClient()

  useProvesQueue()

  const event = useQuery({
    queryKey: eventKeys.one(id),
    queryFn: () => fetchEvent(id),
    enabled: id !== '',
  })

  const gimcana = useQuery({
    queryKey: gimcanaKeys.one(id),
    queryFn: () => fetchGimcana(id),
    enabled: id !== '',
    // La cua es mou mentre mires: la junta valida al costat.
    refetchInterval: 20_000,
  })

  const open = gimcana.data?.estat === 'oberta' ? gimcana.data : null

  const board = useQuery({
    queryKey: gimcanaKeys.board(open?.id ?? ''),
    queryFn: () => fetchBoard(open?.id ?? ''),
    enabled: open !== null,
  })

  return (
    <main className="with-tabbar min-h-dvh bg-app">
      <JuntaHeader to={`/esdeveniment/${id}`} label={event.data?.titulo ?? t('gimcana.back')} />

      <div className={GUTTER}>
        <h1 className="display text-d-s tracking-[-0.045em]">{t('gimcana.title')}</h1>
      </div>

      {gimcana.isPending ? (
        <p className={`py-8 text-fg-muted ${GUTTER}`}>{t('state.loading')}</p>
      ) : gimcana.isError ? (
        <p role="alert" className={`py-8 text-md font-bold text-error ${GUTTER}`}>
          {t(errorKey(gimcana.error))}
        </p>
      ) : gimcana.data?.estat === 'no_hi_es' ? (
        <p className={`py-8 text-md text-fg-muted ${GUTTER} [text-wrap:pretty]`}>
          {t('gimcana.none')}
        </p>
      ) : gimcana.data?.estat === 'tancada' ? (
        <p className={`py-8 text-md text-fg-muted ${GUTTER} [text-wrap:pretty]`}>
          {t('gimcana.closed')}
        </p>
      ) : open === null ? null : open.equip === null ? (
        <TeamPicker
          gimcanaId={open.id}
          onPicked={() => {
            void client.invalidateQueries({ queryKey: gimcanaKeys.all() })
          }}
        />
      ) : (
        <>
          {/* Amb qui jugues i quant portes, sempre a la vista: és el que fa que
              una prova qualsevol sigui una prova per a algú. */}
          <div className="mt-7 flex items-center gap-6 border-y border-brand-banner-border bg-brand-banner px-[var(--ds-gutter)] py-6">
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-bold [text-wrap:pretty]">
                {t('gimcana.playingWith', { team: teamName(open.equip, 0, t) })}
              </p>
              <p className="mt-1 text-[12.5px] text-brand-banner-fg [text-wrap:pretty]">
                {t('gimcana.doneTonight', {
                  count: open.proves.filter((p) => p.estat === 'validada').length,
                })}
              </p>
            </div>
            <p className="tabular display flex-none text-[24px] tracking-[-0.04em]">
              {String(board.data?.find((r) => r.meu)?.punts ?? 0)}
            </p>
          </div>

          <ul className="mt-3">
            {open.proves.map((p) => (
              <li key={p.id}>
                {p.estat === 'validada' || p.estat === 'pendent' ? (
                  <div className={ROW}>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold [text-wrap:pretty]">{p.titol}</p>
                      <p className="mt-[3px] text-[12.5px] text-fg-muted-lo [text-wrap:pretty]">
                        {p.estat === 'validada' && p.qui !== null
                          ? t('gimcana.sentBy', { name: p.qui })
                          : t('gimcana.juntaLooking')}
                      </p>
                    </div>
                    <div className="flex-none text-right">
                      {p.estat === 'validada' ? (
                        <>
                          <p className="tabular text-lg font-extrabold text-success">+{p.punts}</p>
                          <p className="mt-[2px] text-[11.5px] font-bold text-success">
                            {t('gimcana.state.validada')}
                          </p>
                        </>
                      ) : (
                        <p className="text-[12.5px] font-bold text-[var(--ds-warning-deep)]">
                          {t('gimcana.state.pendent')}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <Link to={`/esdeveniment/${id}/gimcana/${p.id}`} className={`${ROW} no-underline`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-fg [text-wrap:pretty]">
                        {p.titol}
                      </p>
                      <p className="mt-[3px] text-[12.5px] text-fg-muted-lo [text-wrap:pretty]">
                        {p.estat === 'rebutjada'
                          ? t('gimcana.tryAgain')
                          : t('gimcana.worth', { n: p.punts })}
                      </p>
                    </div>
                    <span aria-hidden="true" className="flex-none text-2xl text-fg-muted-lo">
                      ›
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ul>

          <div className={`pt-8 pb-10 ${GUTTER}`}>
            <Link
              to={`/esdeveniment/${id}/gimcana/marcador`}
              className="flex min-h-[60px] items-center justify-between gap-5 border border-surface-8 bg-surface-2 px-8 py-6 text-fg no-underline"
            >
              <span className="min-w-0">
                <span className="block text-md font-bold">{t('gimcana.boardLink')}</span>
                <span className="tabular mt-1 block text-[12.5px] text-fg-muted-lo">
                  {(board.data ?? [])
                    .slice(0, 3)
                    .map((r, i) => `${teamName(r, i, t)} ${String(r.punts)}`)
                    .join(' · ')}
                </span>
              </span>
              <span aria-hidden="true" className="flex-none text-2xl text-fg-muted-lo">
                ›
              </span>
            </Link>
            <p className="mt-6 text-[12.5px] text-fg-muted-lo [text-wrap:pretty]">
              {t('gimcana.rule')}
            </p>
            {open.a_la_cua > 0 ? (
              <p className="tabular mt-3 text-[12.5px] font-bold text-[var(--ds-warning-deep)]">
                {t('gimcana.inQueue', { count: open.a_la_cua })}
              </p>
            ) : null}
          </div>
        </>
      )}
    </main>
  )
}

/**
 * Triar equip, quan la gimcana és de les que se'ls fan ells.
 *
 * L'única pantalla dels quatre modes que demana res: als altres tres, o l'equip
 * surt del teu perfil o te l'han posat, i qui arriba tard cau al més petit
 * sense haver de decidir res enmig d'una festa.
 */
function TeamPicker({
  gimcanaId,
  onPicked,
}: {
  readonly gimcanaId: string
  readonly onPicked: () => void
}) {
  const { t } = useTranslation()

  const teams = useQuery({
    queryKey: gimcanaKeys.teams(gimcanaId),
    queryFn: () => fetchTeams(gimcanaId),
  })

  const pick = useMutation({
    mutationFn: (equipId: string) => pickTeam(equipId),
    onSuccess: onPicked,
  })

  return (
    <div className={`pt-8 pb-10 ${GUTTER}`}>
      <h2 className="text-lg font-bold [text-wrap:pretty]">{t('gimcana.pick.title')}</h2>
      <p className="mt-4 text-sm text-fg-muted [text-wrap:pretty]">{t('gimcana.pick.lead')}</p>

      <div className="mt-7 grid gap-4">
        {(teams.data ?? []).map((team, i) => (
          <button
            key={team.id}
            type="button"
            disabled={pick.isPending}
            onClick={() => {
              pick.mutate(team.id)
            }}
            className="flex min-h-[56px] items-center justify-between gap-5 border-[1.5px] border-surface-7 bg-surface-1 px-8 py-6 text-left disabled:opacity-60"
          >
            <span className="text-base font-bold [text-wrap:pretty]">
              {teamName(team, i, t)}
            </span>
            <span className="tabular flex-none text-[12.5px] font-bold text-fg-muted-lo">
              {t('gimcana.pick.people', { count: team.quants })}
            </span>
          </button>
        ))}
      </div>

      {pick.isError ? (
        <p role="alert" className="mt-5 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(pick.error))}
        </p>
      ) : pick.data === 'ple' ? (
        <p role="alert" className="mt-5 text-md font-bold text-warning [text-wrap:pretty]">
          {t('gimcana.pick.full')}
        </p>
      ) : null}
    </div>
  )
}
