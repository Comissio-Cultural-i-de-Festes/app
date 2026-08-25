import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { JuntaHeader } from '@/features/junta/JuntaHeader'
import { errorKey } from '@/lib/errors'

import { fetchBoard, fetchGimcana, gimcanaKeys } from './api'
import { teamName } from './teamName'

/**
 * El marcador.
 *
 * ÉS DE LA NIT I PROU. No toca el rànquing del curs ni escriu a `points_log`, i
 * això es diu a la pantalla perquè algú ho preguntarà. Si un dia ha de comptar,
 * serà una decisió de barem i no una pantalla nova.
 *
 * Es mou quan la junta valida, i per això diu quantes fotos hi ha a la cua: un
 * marcador aturat amb dotze fotos esperant s'entén; un marcador aturat sense
 * cap explicació sembla espatllat.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function ScoreboardScreen() {
  const { t } = useTranslation()
  const { id = '' } = useParams()

  const gimcana = useQuery({
    queryKey: gimcanaKeys.one(id),
    queryFn: () => fetchGimcana(id),
    enabled: id !== '',
    refetchInterval: 20_000,
  })
  const open = gimcana.data?.estat === 'oberta' ? gimcana.data : null

  const board = useQuery({
    queryKey: gimcanaKeys.board(open?.id ?? ''),
    queryFn: () => fetchBoard(open?.id ?? ''),
    enabled: open !== null,
    refetchInterval: 20_000,
  })

  const rows = board.data ?? []
  const anyPoints = rows.some((r) => r.punts > 0)

  return (
    <main className="with-tabbar min-h-dvh bg-app">
      <JuntaHeader to={`/esdeveniment/${id}/gimcana`} label={t('gimcana.title')} />

      <div className={GUTTER}>
        <h1 className="display text-d-s tracking-[-0.045em]">{t('gimcana.board')}</h1>
        <p className="mt-5 text-sm text-fg-muted [text-wrap:pretty]">
          {open === null
            ? t('gimcana.closed')
            : open.a_la_cua > 0
              ? t('gimcana.boardLead', { count: open.a_la_cua })
              : t('gimcana.boardLeadEmpty')}
        </p>
      </div>

      {board.isError ? (
        <p role="alert" className={`py-8 text-md font-bold text-error ${GUTTER}`}>
          {t(errorKey(board.error))}
        </p>
      ) : !anyPoints ? (
        <p className={`py-8 text-md text-fg-muted ${GUTTER} [text-wrap:pretty]`}>
          {t('gimcana.boardEmpty')}
        </p>
      ) : (
        <ul className="mt-7">
          {rows.map((r, i) => (
            <li
              key={r.equip_id}
              className={
                'flex items-center gap-[13px] border-b border-surface-4 px-[var(--ds-gutter)] py-8 ' +
                (r.meu ? 'selected--soft' : '')
              }
            >
              <p
                className={
                  'tabular display w-[26px] flex-none text-d-sm tracking-[-0.05em] ' +
                  (i === 0 ? 'text-brand-accent' : 'text-fg-faint')
                }
              >
                {String(i + 1)}
              </p>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-[7px]">
                  <span className="text-xl font-bold tracking-[-0.01em] [text-wrap:pretty]">
                    {teamName(r, i, t)}
                  </span>
                  {r.meu ? (
                    <span className="flex-none rounded-xs bg-brand-cta px-[7px] py-[3px] text-[10.5px] font-extrabold tracking-[0.1em] whitespace-nowrap text-on-brand uppercase">
                      {t('gimcana.yours')}
                    </span>
                  ) : null}
                </div>
                <p className="mt-[3px] text-[12.5px] text-fg-muted-lo">
                  {t('gimcana.doneCount', { count: r.proves })}
                </p>
              </div>
              <p className="tabular display flex-none text-d-sm tracking-[-0.035em]">
                {String(r.punts)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className={`pt-7 pb-10 text-[12.5px] text-fg-muted-lo ${GUTTER} [text-wrap:pretty]`}>
        {t('gimcana.boardNote')}
      </p>
    </main>
  )
}
