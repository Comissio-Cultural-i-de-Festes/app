import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { profileScreenKeys } from '@/features/profile/api'
import { LEDGER_ROW } from '@/features/profile/ledger'
import { formatDayMonth, formatMonthYear } from '@/i18n/format'
import { type Locale, toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Confirm } from '@/ui/Confirm/Confirm'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { notaValida } from './avis'
import { AvisForm } from './AvisForm'
import { clauGravetat, nomDelTipus } from './avisTipus'
import { type AvisRow, avisosKeys, fetchAvisTipus, fetchAvisos, retiraAvis } from './avisosApi'
import { compta, dinsDelCurs } from './avisosCompte'
import { clauQueFerEstat, estatDe } from './estatAvisos'
import { EstatXip } from './EstatXip'
import { INPUT } from './formBits'
import { useNormativa } from './useNormativa'

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
 * LA LLISTA ÉS L'HISTÒRIC I EL NÚMERO ÉS EL DEL CURS, i no és cap descuit. Qui
 * obre una fitxa hi ve a entendre què porta una persona abans de registrar-li
 * res, i «què porta» inclou el que va passar fa dos cursos: fitar la llista pel
 * curs amagaria justament el que aquesta pantalla existeix per ensenyar. El
 * comptador de la capçalera, en canvi, ha de dir el mateix que el de
 * `/junta/socis`, que és el del curs —«al setembre torna a zero tot sol»—, i per
 * això el fa `compta()` i no un `filter` escrit aquí. Abans n'hi havia un, sobre
 * la lectura sencera: les dues pantalles deien «avisos» i comptaven coses
 * diferents, i quadraven només perquè cap fila no era d'abans d'aquest curs.
 *
 * I LES FILES DE FORA DEL CURS PORTEN L'ANY. Amb el número acotat i la llista
 * no, una fila vella datada «4 de nov.» és una trampa. Ho fa `Data`, a baix.
 *
 * EL CATÀLEG ES BAIXA SENCER, retirats inclosos, i per això no es reaprofita la
 * llista del formulari. Un avís de fa dos cursos pot fer servir un tipus que
 * avui ja no s'ofereix, i la seva fila s'ha de poder pintar amb nom igualment.
 *
 * LA NOTA DE LA RETIRADA ÉS OBLIGATÒRIA i ho diu abans d'apretar. La garantia
 * viu a `retira_avis()` —una nota en blanc torna 22023— i aquí es repeteix
 * perquè un 22023 es tradueix a «alguna cosa ha anat malament» i no a «falta
 * dir per què».
 *
 * I LA PAUSA TÉ VEU, com al formulari de sota. Sense xarxa, React Query no
 * crida `mutationFn` i no falla: deixa la mutació aturada fins que torni la
 * cobertura. `Confirm` desactiva els dos botons amb `busy`, o sigui que sense
 * dir-ho el panell es quedava obert i mort, i el remei que se li acut a
 * qualsevol davant d'un botó que no contesta és tornar-hi. Aquesta mutació
 * tampoc no escriu a cap cua —no li cal `networkMode: 'always'`—, i per això el
 * que ha de dir és que espera, no que ha fallat.
 */

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

  const { pesos, llindars, des_de, fins_a, llest } = useNormativa()

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
      await client.invalidateQueries({ queryKey: avisosKeys.comptesTots() })
      // La compensació és una fila NOVA al llibre major, no una edició de la
      // vella: sense això, el registre de dalt es queda ensenyant el `-25` sol.
      await client.invalidateQueries({ queryKey: profileScreenKeys.points(userId) })
      await client.invalidateQueries({ queryKey: ['ranking'] })
    },
  })

  const rows = avisos.data ?? []
  // El MATEIX recompte que la llista de socis, i per la mateixa funcio: vius i
  // d'aquest curs. Aqui hi havia un rows.filter(retirat_at === null).length
  // sobre una lectura sense finestra, o sigui que les dues pantalles deien
  // «avisos» i comptaven coses diferents. Quadraven per les dades d'avui i el
  // setembre que ve el de la llista tornaria a zero i el d'aqui no.
  const compte = compta(rows, des_de, fins_a, pesos).get(userId)
  const vius = compte?.quants ?? 0
  // L'escaló, amb el mateix `estatDe()` que la llista de socis: les dues
  // pantalles han de dir el mateix de la mateixa persona.
  const estat = estatDe(compte, llindars)
  const queFer = clauQueFerEstat(estat)

  return (
    <section className="pt-10">
      <div className="flex items-baseline justify-between gap-6">
        <h2 className="eyebrow text-fg-muted">{t('junta.soci.avisos.title')}</h2>
        {avisos.isSuccess && llest ? (
          <p className="tabular text-lg font-extrabold">
            {t('junta.soci.avisos.live', { count: vius })}
          </p>
        ) : null}
      </div>

      {/* L'escaló i què vol dir, només si té avisos vius: a qui no en té cap,
          «Tot en ordre» a la seva fitxa és soroll. */}
      {avisos.isSuccess && llest && compte !== undefined ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <EstatXip estat={estat} />
          {queFer === null ? null : (
            <p className="min-w-0 flex-1 text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
              {t(queFer)}
            </p>
          )}
        </div>
      ) : null}

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
            <li key={row.id} className={LEDGER_ROW}>
              <Data quan={row.created_at} desDe={des_de} finsA={fins_a} locale={locale} />
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
                  // Un afordament de fila i no un CTA: obre la confirmació, no
                  // retira res. El botó de la casa aquí seria un rectangle de
                  // 56px enmig d'una llista, i prometria que el que fa passa en
                  // tocar-lo.
                  <button
                    type="button"
                    onClick={() => {
                      setRetirant(row.id)
                      setNota('')
                    }}
                    className="mt-5 -ml-4 min-h-[44px] px-4 text-sm font-bold text-warning [text-wrap:balance]"
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

      {/* En pausa i no fallada, com al formulari de sota: `role="status"` i no
          `alert`, i en ambre i no en vermell. React Query atura la mutació
          sense xarxa —no crida `mutationFn`, no falla, no fa res—, o sigui que
          prémer «Retira l'avís» sota terra deixava el botó ocupat i cap frase
          enlloc. No es perd res, però l'únic remei que se li acut a ningú
          davant d'un botó que no contesta és tornar-hi. */}
      {retira.isPaused ? (
        <p role="status" className="pt-6 text-sm font-bold text-warning [text-wrap:pretty]">
          {t('junta.soci.avisos.withdrawPaused')}
        </p>
      ) : null}

      {retira.isError ? (
        <p role="alert" className="pt-6 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(retira.error))}
        </p>
      ) : null}

      <AvisForm userId={userId} nombre={nombre} pesAra={compte?.pes ?? 0} />
    </section>
  )
}

/**
 * La data de la fila, amb l'any quan no és d'aquest curs.
 *
 * «4 de nov.» AL COSTAT D'UN «12 de set.» es llegeix com el novembre que ve,
 * i aquesta llista baixa l'històric sencer: una fila de fa tres cursos hi
 * sortia amb la mateixa pinta que la d'ahir, just a sota d'un comptador que
 * ara només compta les d'aquest curs. Amb el número acotat i la llista no,
 * dir de quin any és cada fila deixa de ser un detall.
 *
 * L'ANY ARRIBA I EL DIA SE'N VA. La columna fa 52px i el dia, el mes i l'any
 * no hi caben en una línia; de les tres coses, la que importa d'un avís vell
 * és de quin curs era. El dia exacte continua a la base i a l'auditoria.
 *
 * LA CONDICIÓ ÉS `dinsDelCurs`, la mateixa que decideix què compta el número
 * de la capçalera. Escrita dues vegades, hi hauria files datades amb l'any que
 * el comptador sí que compta, o al revés.
 */
function Data({
  quan,
  desDe,
  finsA,
  locale,
}: {
  readonly quan: string
  readonly desDe: string | null
  readonly finsA: string | null
  readonly locale: Locale
}) {
  const d = new Date(quan)
  return (
    <p className="w-[52px] flex-none pt-[2px] text-sm-lo font-semibold text-fg-dim">
      {dinsDelCurs(quan, desDe, finsA) ? formatDayMonth(d, locale) : formatMonthYear(d, locale)}
    </p>
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
  return <p className="tabular flex-none pt-[2px] text-base font-extrabold text-warning">{punts}</p>
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
    <Confirm
      className="mt-5"
      cta={t('junta.soci.avisos.withdraw')}
      cancel={t('actions.cancel')}
      busy={busy}
      disabled={!valid}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
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
    </Confirm>
  )
}

function AvisosSkeleton() {
  return (
    <Skeleton className="mt-2">
      {[0, 1].map((i) => (
        <div key={i} className={LEDGER_ROW}>
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
