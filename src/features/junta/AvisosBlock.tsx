import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { profileScreenKeys } from '@/features/profile/api'
import { formatDayMonth } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { notaValida } from './avis'
import { AvisForm } from './AvisForm'
import { clauGravetat, nomDelTipus } from './avisTipus'
import { type AvisRow, avisosKeys, fetchAvisTipus, fetchAvisos, retiraAvis } from './avisosApi'
import { INPUT } from './formBits'

/**
 * Els avisos d'una persona, i la manera de retirar-ne un.
 *
 * LA MEITAT OPERATIVA QUE FALTAVA. La migració 73 va deixar `avisa()` i
 * `retira_avis()` escrites, provades i sense cap cridador: la junta podia editar
 * el catàleg a `/junta/barem` i no podia registrar ni un avís. Aquest bloc i
 * `AvisForm` són la porta.
 *
 * EL REGISTRE A SOBRE I EL FORMULARI A SOTA, com el llibre major i l'ajust de la
 * pantalla que l'allotja. Ningú no ha d'avisar algú sense haver mirat abans què
 * porta: posar el formulari a dalt és convidar a registrar el segon avís d'una
 * cosa que ja té el seu.
 *
 * EL RETIRAT ES RATLLA I ES QUEDA. No desapareix ni es mou al final: la fila és
 * el que explica el `-25` i el `+25` que hi ha al llibre major just a sobre, i
 * una retirada que s'endugués la fila deixaria els dos moviments orfes. Ratllat
 * vol dir «això ja no compta», que és diferent de «això no va passar».
 *
 * EL CATÀLEG ES BAIXA SENCER, retirats inclosos, i per això no es reaprofita la
 * llista del formulari. Un avís de fa dos cursos pot fer servir un tipus que
 * avui ja no s'ofereix, i la seva fila s'ha de poder pintar amb nom igualment.
 *
 * LA NOTA DE LA RETIRADA ÉS OBLIGATÒRIA i ho diu abans d'apretar. La garantia
 * viu a `retira_avis()` —una nota en blanc torna 22023— i aquí es repeteix
 * perquè un 22023 es tradueix a «alguna cosa ha anat malament» i no a «falta
 * dir per què».
 */

const ROW = 'flex items-start gap-4 border-b border-surface-4 py-[15px]'

export function AvisosBlock({
  userId,
  nombre,
}: {
  readonly userId: string
  readonly nombre: string
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const client = useQueryClient()

  const [retirant, setRetirant] = useState<string | null>(null)
  const [nota, setNota] = useState('')

  const avisos = useQuery({
    queryKey: avisosKeys.ofMember(userId),
    queryFn: () => fetchAvisos(userId),
  })
  const cataleg = useQuery({ queryKey: avisosKeys.tipus(), queryFn: fetchAvisTipus })

  const traduccio = (clau: string): string =>
    i18n.exists(`avisos.tipus.${clau}`) ? t(`avisos.tipus.${clau}`) : ''

  const nom = (clau: string): string => {
    const row = cataleg.data?.find((r) => r.clau === clau)
    return row === undefined ? clau : nomDelTipus(row, traduccio(clau))
  }

  const gravetatNom = (n: number): string => {
    const clau = clauGravetat(n)
    return clau === null ? String(n) : t(clau)
  }

  const retira = useMutation({
    mutationFn: (v: { readonly id: string; readonly nota: string }) => retiraAvis(v.id, v.nota),
    onSuccess: async () => {
      setRetirant(null)
      setNota('')
      await client.invalidateQueries({ queryKey: avisosKeys.ofMember(userId) })
      await client.invalidateQueries({ queryKey: avisosKeys.comptes() })
      // La compensació és una fila NOVA al llibre major, no una edició de la
      // vella: sense això, el registre de dalt es queda ensenyant el `-25` sol.
      await client.invalidateQueries({ queryKey: profileScreenKeys.points(userId) })
      await client.invalidateQueries({ queryKey: ['ranking'] })
    },
  })

  const rows = avisos.data ?? []
  const vius = rows.filter((row) => row.retirat_at === null).length

  return (
    <section className="pt-10">
      <div className="flex items-baseline justify-between gap-6">
        <h2 className="eyebrow text-fg-muted">{t('junta.soci.avisos.title')}</h2>
        {avisos.isSuccess ? (
          <p className="tabular text-lg font-extrabold">
            {t('junta.soci.avisos.live', { count: vius })}
          </p>
        ) : null}
      </div>

      {avisos.isPending ? (
        <AvisosSkeleton />
      ) : avisos.isError ? (
        <p role="alert" className="pt-8 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(avisos.error))}
        </p>
      ) : rows.length === 0 ? (
        <p className="pt-8 text-md text-fg-muted [text-wrap:pretty]">
          {t('junta.soci.avisos.empty')}
        </p>
      ) : (
        <ul className="mt-2">
          {rows.map((row) => (
            <li key={row.id} className={ROW}>
              <p className="w-[52px] flex-none pt-[2px] text-sm-lo font-semibold text-fg-dim">
                {formatDayMonth(new Date(row.created_at), locale)}
              </p>
              <div className="min-w-0 flex-1">
                <p
                  className={
                    'text-base font-semibold [text-wrap:pretty] ' +
                    (row.retirat_at === null ? '' : 'text-fg-muted line-through')
                  }
                >
                  {nom(row.tipus)}
                </p>
                <p className="mt-[3px] text-sm-lo text-[var(--ds-text-muted-lo)]">
                  {gravetatNom(row.gravetat)}
                </p>
                <p
                  className={
                    'mt-[5px] text-sm [text-wrap:pretty] ' +
                    (row.retirat_at === null ? 'text-fg-secondary' : 'text-fg-muted line-through')
                  }
                >
                  {row.nota}
                </p>

                {row.retirat_at === null ? null : (
                  <p className="mt-[6px] text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
                    {t('junta.soci.avisos.withdrawnOn', {
                      dia: formatDayMonth(new Date(row.retirat_at), locale),
                    })}
                    {row.retirat_nota === null ? '' : ` · ${row.retirat_nota}`}
                  </p>
                )}

                {row.retirat_at !== null ? null : retirant === row.id ? (
                  <Retirada
                    nota={nota}
                    setNota={setNota}
                    busy={retira.isPending}
                    onCancel={() => {
                      setRetirant(null)
                      setNota('')
                    }}
                    onConfirm={() => {
                      retira.mutate({ id: row.id, nota: nota.trim() })
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRetirant(row.id)
                      setNota('')
                    }}
                    className="mt-5 min-h-[44px] px-4 text-sm font-bold text-[var(--ds-warning)] [text-wrap:balance] -ml-4"
                  >
                    {t('junta.soci.avisos.withdraw')}
                  </button>
                )}
              </div>
              <Punts row={row} />
            </li>
          ))}
        </ul>
      )}

      {retira.isError ? (
        <p role="alert" className="pt-6 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(retira.error))}
        </p>
      ) : null}

      <AvisForm userId={userId} nombre={nombre} />
    </section>
  )
}

/**
 * Els punts de l'avís, quan en va restar.
 *
 * NO ES RATLLEN QUAN ESTÀ RETIRAT, i és a posta: el `-25` continua sent el que
 * va passar aquell dia, i el que el desfà és la fila `+25` del llibre major, que
 * es veu a sobre. Ratllar-lo aquí diria que aquells punts no es van restar mai,
 * que és fals i és justament el que la doctrina de les dues files evita.
 */
function Punts({ row }: { readonly row: AvisRow }) {
  const punts = row.points_log?.puntos ?? null
  if (punts === null || punts === 0) return null
  return (
    <p className="tabular flex-none pt-[2px] text-base font-extrabold text-[var(--ds-warning)]">
      {punts}
    </p>
  )
}

function Retirada({
  nota,
  setNota,
  busy,
  onCancel,
  onConfirm,
}: {
  readonly nota: string
  readonly setNota: (v: string) => void
  readonly busy: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => void
}) {
  const { t } = useTranslation()
  const valid = notaValida(nota)

  return (
    <div className="mt-5">
      <p className="text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {t('junta.soci.avisos.withdrawSure')}
      </p>
      <textarea
        value={nota}
        onChange={(e) => {
          setNota(e.target.value)
        }}
        rows={2}
        maxLength={500}
        aria-label={t('junta.soci.avisos.withdrawNote')}
        placeholder={t('junta.soci.avisos.withdrawPlaceholder')}
        className={`${INPUT} resize-y`}
      />
      <div className="mt-4 flex gap-4">
        <button
          type="button"
          disabled={!valid || busy}
          onClick={onConfirm}
          className="min-h-[46px] flex-1 border-[1.5px] border-[var(--ds-warning)] px-5 text-md font-bold text-[var(--ds-warning)] [text-wrap:balance] disabled:opacity-50"
        >
          {t('junta.soci.avisos.withdraw')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[46px] flex-none px-5 text-md font-bold text-fg-muted"
        >
          {t('actions.cancel')}
        </button>
      </div>
    </div>
  )
}

function AvisosSkeleton() {
  return (
    <Skeleton className="mt-2">
      {[0, 1].map((i) => (
        <div key={i} className={ROW}>
          <SkeletonBar w="w-[42px]" h="h-[11px]" className="mt-[2px] flex-none" />
          <div className="min-w-0 flex-1">
            <SkeletonBar w="w-[46%]" h="h-[14px]" />
            <SkeletonBar w="w-[24%]" h="h-[10px]" className="mt-3" />
            <SkeletonBar w="w-[70%]" h="h-[12px]" className="mt-3" />
          </div>
          <SkeletonBar w="w-[30px]" h="h-[14px]" className="mt-[2px] flex-none" />
        </div>
      ))}
    </Skeleton>
  )
}
