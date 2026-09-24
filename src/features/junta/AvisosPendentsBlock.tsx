import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { formatDayMonth } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Confirm } from '@/ui/Confirm/Confirm'

import { notaValida } from './avis'
import { clauGravetat, nomDelTipus } from './avisTipus'
import { avisosKeys, fetchAvisTipus } from './avisosApi'
import { INPUT } from './formBits'
import { fetchAllMembers, memberKeys } from './membersApi'
import { type EstatPendent, estatDelPendent } from './pendents'
import {
  type PendentRow,
  enllacaPendent,
  fetchPendentsEsperen,
  fetchPendentsResolts,
  pendentsKeys,
  retiraPendent,
} from './pendentsApi'

/**
 * Els avisos pendents, al rebedor de `/junta`: qui espera, per què, i què s'hi
 * pot fer.
 *
 * AQUÍ I NO A UNA PANTALLA PRÒPIA perquè la major part del temps la llista és
 * curta o buida, i el que la junta ha de veure és si n'hi ha algun que demana
 * una decisió —ambigu o bloquejat—. El formulari sí que té pantalla pròpia: són
 * vuit camps.
 *
 * ELS QUE ESPEREN SEMPRE, ELS RESOLTS A DEMANDA. Els resolts són història i
 * creixen cada curs; baixar-los cada cop que s'obre el rebedor seria pagar per
 * una llista que ningú no ha demanat.
 *
 * DUES ACCIONS PER FILA, i cap no esborra: RETIRAR, amb un motiu escrit com
 * `retira_avis`, i ENLLAÇAR A MÀ, per als casos que l'enganxada no decideix
 * sola. El cercador de l'enllaç busca entre els socis actius pel nom; el
 * telèfon no hi surt perquè la junta el té a la fila i el que ha de decidir és
 * QUI és.
 *
 * El telèfon es pinta mentre espera i desapareix quan es resol, que és el que fa
 * la base: n'hi ha prou amb saber a qui es va enllaçar.
 */

const GUTTER = 'px-[var(--ds-gutter)]'
const ROW = 'border-t border-surface-4 py-6'

const TO_ESTAT: Readonly<Record<EstatPendent, string>> = {
  sense_enllacar: 'text-[var(--ds-text-muted-lo)]',
  ambigu: 'text-warning',
  bloquejat: 'text-warning',
  enllacat: 'text-success',
  retirat: 'text-fg-muted',
}

export function AvisosPendentsBlock() {
  const { t } = useTranslation()
  const [resolts, setResolts] = useState(false)

  const esperen = useQuery({ queryKey: pendentsKeys.esperen(), queryFn: fetchPendentsEsperen })
  const vells = useQuery({
    queryKey: pendentsKeys.resolts(),
    queryFn: fetchPendentsResolts,
    enabled: resolts,
  })

  const rows = [...(esperen.data ?? []), ...(resolts ? (vells.data ?? []) : [])]

  return (
    <div className="mt-6">
      <div className={GUTTER}>
        <Link
          to="/junta/pendents/nou"
          className="flex min-h-[54px] w-full items-center justify-center border-[1.5px] border-dashed border-[var(--ds-border-input)] px-7 py-6 text-lg font-bold text-fg no-underline [text-wrap:balance]"
        >
          {t('junta.pendents.nou')}
        </Link>
      </div>

      {esperen.isError ? (
        <p role="alert" className={`pt-6 text-md font-bold text-error ${GUTTER}`}>
          {t(errorKey(esperen.error))}
        </p>
      ) : esperen.isSuccess && rows.length === 0 ? (
        <p className={`pt-6 text-md text-fg-muted [text-wrap:pretty] ${GUTTER}`}>
          {t('junta.pendents.none')}
        </p>
      ) : (
        <ul className="mt-6">
          {rows.map((row) => (
            <Fila key={row.id} row={row} />
          ))}
        </ul>
      )}

      <div className={`pt-4 ${GUTTER}`}>
        <button
          type="button"
          aria-pressed={resolts}
          onClick={() => {
            setResolts((ara) => !ara)
          }}
          className="-ml-4 min-h-[44px] px-4 text-sm font-bold text-fg-secondary [text-wrap:balance]"
        >
          {resolts ? t('junta.pendents.hideResolved') : t('junta.pendents.showResolved')}
        </button>
      </div>
    </div>
  )
}

function Fila({ row }: { readonly row: PendentRow }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const client = useQueryClient()
  const [obert, setObert] = useState<'retira' | 'enllaca' | null>(null)
  const [nota, setNota] = useState('')
  const [cerca, setCerca] = useState('')
  const [triat, setTriat] = useState<{ readonly id: string; readonly nombre: string } | null>(null)

  const estat = estatDelPendent(row)
  const cataleg = useQuery({ queryKey: avisosKeys.tipus(), queryFn: fetchAvisTipus })
  const members = useQuery({
    queryKey: memberKeys.list(),
    queryFn: fetchAllMembers,
    enabled: obert === 'enllaca',
  })

  const tancat = async () => {
    setObert(null)
    setNota('')
    setCerca('')
    setTriat(null)
    await client.invalidateQueries({ queryKey: pendentsKeys.all() })
  }

  const retira = useMutation({
    mutationFn: () => retiraPendent(row.id, nota.trim()),
    onSuccess: tancat,
  })

  const enllaca = useMutation({
    mutationFn: () => {
      if (triat === null) throw new Error('cap soci triat')
      return enllacaPendent(row.id, triat.id)
    },
    onSuccess: async () => {
      await tancat()
      // Un avís nou d'algú, i potser una fila nova al llibre major.
      await client.invalidateQueries({ queryKey: ['junta', 'avisos'] })
      await client.invalidateQueries({ queryKey: ['ranking'] })
    },
  })

  const tipusRow = cataleg.data?.find((r) => r.clau === row.tipus)
  const tipusNom =
    tipusRow === undefined
      ? row.tipus
      : nomDelTipus(
          tipusRow,
          i18n.exists(`avisos.tipus.${row.tipus}`) ? t(`avisos.tipus.${row.tipus}`) : '',
        )
  const gravetat = clauGravetat(row.gravetat)
  const dia = formatDayMonth(new Date(row.falta_at), locale)

  const agulla = cerca.trim().toLowerCase()
  const candidats =
    agulla === ''
      ? []
      : (members.data ?? [])
          .filter((m) => m.estat === 'actiu' && m.nombre.toLowerCase().includes(agulla))
          .slice(0, 6)

  const motiu =
    estat !== 'bloquejat' || row.motiu === null
      ? null
      : t(`junta.pendents.motiu.${row.motiu}`, { codi: row.motiu_codi ?? '' })

  return (
    <li className={`${ROW} ${GUTTER}`}>
      <div className="flex items-baseline justify-between gap-5">
        <p
          className={
            'min-w-0 text-base font-bold [text-wrap:pretty] ' +
            (estat === 'retirat' ? 'text-fg-muted line-through' : 'text-fg')
          }
        >
          {row.nom}
        </p>
        {row.telefon === null ? null : (
          <p className="tabular flex-none text-sm-lo text-[var(--ds-text-muted-lo)]">
            {row.telefon}
          </p>
        )}
      </div>

      <p className="mt-[3px] text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {[
          t('junta.pendents.falta', { dia }),
          tipusNom,
          gravetat === null ? String(row.gravetat) : t(gravetat),
          row.punts === 0 ? null : String(row.punts),
        ]
          .filter((part): part is string => part !== null)
          .join(' · ')}
      </p>

      <p className="mt-[5px] text-sm text-fg-secondary [text-wrap:pretty]">{row.nota}</p>

      <p className={`mt-4 text-sm font-bold [text-wrap:pretty] ${TO_ESTAT[estat]}`}>
        {estat === 'enllacat'
          ? t('junta.pendents.estat.enllacat', { nom: row.avis?.profile?.nombre ?? '—' })
          : t(`junta.pendents.estat.${estat}`)}
        {motiu === null ? '' : ` · ${motiu}`}
        {estat === 'retirat' && row.retirat_nota !== null ? ` · ${row.retirat_nota}` : ''}
      </p>

      {estat === 'enllacat' || estat === 'retirat' ? null : obert === null ? (
        <div className="mt-3 flex flex-wrap gap-x-6">
          <button
            type="button"
            onClick={() => {
              setObert('enllaca')
            }}
            className="-ml-4 min-h-[44px] px-4 text-sm font-bold text-fg-secondary [text-wrap:balance]"
          >
            {t('junta.pendents.enllaca')}
          </button>
          <button
            type="button"
            onClick={() => {
              setObert('retira')
            }}
            className="min-h-[44px] px-4 text-sm font-bold text-warning [text-wrap:balance]"
          >
            {t('junta.pendents.retira')}
          </button>
        </div>
      ) : obert === 'retira' ? (
        <Confirm
          className="mt-5"
          cta={t('junta.pendents.retira')}
          cancel={t('actions.cancel')}
          busy={retira.isPending}
          disabled={!notaValida(nota)}
          onConfirm={() => {
            retira.mutate()
          }}
          onCancel={() => {
            setObert(null)
            setNota('')
          }}
        >
          <textarea
            value={nota}
            onChange={(e) => {
              setNota(e.target.value)
            }}
            rows={2}
            maxLength={500}
            aria-label={t('junta.pendents.retiraNote')}
            placeholder={t('junta.pendents.retiraPlaceholder')}
            className={`${INPUT} resize-y`}
          />
          {retira.isError ? (
            <p role="alert" className="mt-3 text-md font-bold text-error [text-wrap:pretty]">
              {t(errorKey(retira.error))}
            </p>
          ) : null}
        </Confirm>
      ) : (
        <div className="mt-5">
          {triat === null ? (
            <>
              <input
                value={cerca}
                onChange={(e) => {
                  setCerca(e.target.value)
                }}
                type="search"
                autoComplete="off"
                aria-label={t('junta.pendents.cerca')}
                placeholder={t('junta.pendents.cerca')}
                className={INPUT}
              />
              {agulla !== '' && members.isSuccess && candidats.length === 0 ? (
                <p className="mt-3 text-sm text-fg-muted">{t('junta.pendents.capSoci')}</p>
              ) : null}
              <ul className="mt-2">
                {candidats.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setTriat({ id: m.id, nombre: m.nombre })
                      }}
                      className="flex min-h-[46px] w-full items-center border-b border-surface-4 text-left text-md font-semibold text-fg"
                    >
                      {m.nombre}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  setObert(null)
                  setCerca('')
                }}
                className="mt-3 -ml-4 min-h-[44px] px-4 text-sm font-bold text-fg-muted"
              >
                {t('actions.cancel')}
              </button>
            </>
          ) : (
            <Confirm
              cta={t('junta.pendents.enllacaCta')}
              cancel={t('actions.cancel')}
              busy={enllaca.isPending}
              onConfirm={() => {
                enllaca.mutate()
              }}
              onCancel={() => {
                setTriat(null)
              }}
            >
              <p className="text-sm text-fg-secondary [text-wrap:pretty]">
                {t('junta.pendents.enllacaSure', { nom: row.nom, soci: triat.nombre, dia })}
              </p>
              {enllaca.isError ? (
                <p role="alert" className="mt-3 text-md font-bold text-error [text-wrap:pretty]">
                  {t(errorKey(enllaca.error))}
                </p>
              ) : null}
            </Confirm>
          )}
        </div>
      )}
      {/* En pausa i no fallada, com a la fitxa d'un soci: sense xarxa React
          Query no crida res, i un botó que no contesta es torna a prémer. */}
      {retira.isPaused || enllaca.isPaused ? (
        <p role="status" className="pt-4 text-sm font-bold text-warning [text-wrap:pretty]">
          {t('junta.soci.avis.paused')}
        </p>
      ) : null}
    </li>
  )
}
