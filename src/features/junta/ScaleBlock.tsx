import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { doorKeys } from '@/features/door/api'
import { errorKey } from '@/lib/errors'
import { Button } from '@/ui/Button/Button'
import { DoneLine } from '@/ui/Notice/DoneLine'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { clauQueFer } from './avisTipus'
import { setPointValue } from './configApi'
import { clauQueFerEstat } from './estatAvisos'
import { type PointValue, fetchPointValues } from './eventFormApi'

/**
 * What each thing is worth.
 *
 * One number per row and no way to add one. A new `clau` is a change in three
 * places — the row, a CHECK constraint, and an allowlist inside award_points —
 * and a screen can only do the first, so the row on its own would be a button
 * that exists, looks right, and fails when somebody presses it at a door. The
 * prototype already drew that button once.
 *
 * VIU AL SEU FITXER, com l'`AvisTipusBlock` que té al costat. Es demana les
 * seves dades i la seva mutació, o sigui que és un bloc i no un tros de
 * pantalla; mentre va viure dins de `ScaleScreen.tsx`, aquella pantalla era
 * dues-centes línies per muntar dues coses que no es parlen.
 */

const LIMIT = 500
const FILA = 'flex min-h-[60px] items-center gap-5 border-b border-surface-4 py-4'

/**
 * Què vol dir cada número de la normativa, escrit sota el seu nom.
 *
 * UN PES O UN ESCALÓ SENSE LA SEVA CONSEQÜÈNCIA ÉS UN NÚMERO SOLT. «Pes d'una
 * greu: 2» no diu res a qui arriba a la junta al setembre; «avís per escrit» sí.
 * I l'escaló d'expulsió ha de dir, al mateix lloc on es mou, que el que passa en
 * arribar-hi és una votació a la reunió següent i no una baixa.
 *
 * Les claus surten de `clauQueFer` i `clauQueFerEstat`, que les escriuen senceres
 * perquè `tests/i18n-unused` les trobi.
 */
const AJUDA: Readonly<Record<string, string | null>> = {
  pes_lleu: clauQueFer(1),
  pes_greu: clauQueFer(2),
  pes_molt_greu: clauQueFer(3),
  llindar_avis: clauQueFerEstat('avis'),
  llindar_risc: clauQueFerEstat('risc'),
  llindar_expulsio: clauQueFerEstat('expulsio'),
}

export function ScaleBlock() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<string | null>(null)

  const values = useQuery({ queryKey: doorKeys.pointValues(), queryFn: fetchPointValues })

  const save = useMutation({
    mutationFn: (value: PointValue) =>
      setPointValue({ mena: value.mena, clau: value.clau, punts: value.punts }),
    onSuccess: async (_data, value) => {
      const id = keyOf(value)
      setEdits((previous) => {
        const next = { ...previous }
        delete next[id]
        return next
      })
      setSaved(id)
      await client.invalidateQueries({ queryKey: doorKeys.pointValues() })
    },
  })

  if (values.isPending) return <ScaleSkeleton />
  if (values.isError) {
    return (
      <p role="alert" className="text-md font-bold text-error [text-wrap:pretty]">
        {t(errorKey(values.error))}
      </p>
    )
  }

  const rows = values.data
  // ELS TRES ÚLTIMS GRUPS NO SÓN PUNTS: són la normativa dels avisos —què pesa
  // cada gravetat i a quina suma hi ha cada escaló (migració 84)— i el sostre
  // de punts que es poden treure a una persona en un curs. Viuen a
  // `point_values` perquè és la taula que el repositori ja té per a «un número
  // que la junta mou sense desplegar», amb la seva política, el seu grant i la
  // seva RPC auditada fets des de la migració 25. Una taula nova per a set
  // enters hauria estat sis peces més per mantenir.
  //
  // PARTITS PER PREFIX DE LA CLAU i no per `ordre`: l'ordre el pot moure la
  // junta, i un pes que caigués al grup dels escalons per un número canviat
  // seria una fila que diu una cosa i en fa una altra.
  //
  // I CADA GRUP DIU COM ES DIU UNA FILA SEVA, amb el prefix escrit sencer dins
  // del `t()`. Això abans era un `label` que es concatenava a fora, i llavors
  // `tests/i18n-unused.test.ts` no hi veia cap prefix —el seu escàner llegeix
  // la part fixa del literal, i allà no n'hi havia—. Les claus del grup nou li
  // sortien com a inabastables, que és exactament el que aquell fitxer ha de
  // detectar; la manera de callar-lo era donar-li la veritat, no una excepció.
  const nomAvisos = (clau: string) => t(`junta.config.avisos.num.${clau}`, { defaultValue: clau })

  const groups: readonly GroupSpec[] = [
    {
      mena: 'motiu',
      heading: t('junta.config.scale.motius'),
      name: (clau: string) => t(`motive.${clau}`, { defaultValue: clau }),
    },
    {
      mena: 'tipus_esdeveniment',
      heading: t('junta.config.scale.tipus'),
      name: (clau: string) => t(`eventType.${clau}`, { defaultValue: clau }),
    },
    {
      mena: 'avisos',
      key: 'pesos',
      heading: t('junta.config.avisos.pesos'),
      name: nomAvisos,
      only: (clau: string) => clau.startsWith('pes_'),
    },
    {
      mena: 'avisos',
      key: 'escalons',
      heading: t('junta.config.avisos.escalons'),
      lede: t('junta.config.avisos.escalonsLede'),
      name: nomAvisos,
      only: (clau: string) => clau.startsWith('llindar_'),
    },
    {
      mena: 'avisos',
      key: 'sostre',
      heading: t('junta.config.avisos.nums'),
      name: nomAvisos,
      only: (clau: string) => !clau.startsWith('pes_') && !clau.startsWith('llindar_'),
    },
  ]

  const group = (which: GroupSpec) => (
    <Group
      key={which.key ?? which.mena}
      heading={which.heading}
      lede={which.lede}
      name={which.name}
      hint={(clau) => {
        const clauAjuda = which.mena === 'avisos' ? AJUDA[clau] : undefined
        return clauAjuda === undefined || clauAjuda === null ? null : t(clauAjuda)
      }}
      rows={rows.filter((r) => r.mena === which.mena && (which.only?.(r.clau) ?? true))}
      edits={edits}
      saved={saved}
      pending={save.isPending ? (save.variables ?? null) : null}
      onType={(id, value) => {
        setSaved(null)
        setEdits((previous) => ({ ...previous, [id]: value }))
      }}
      onSave={(value) => {
        save.mutate(value)
      }}
    />
  )

  return (
    <>
      <p className="pb-8 text-md text-fg-secondary [text-wrap:pretty]">
        {t('junta.config.scale.lede')}
      </p>

      {/* LA FRASE DEL «NO SE'N POT AFEGIR» VA AL MIG I NO AL FINAL, i això no és
          maquetació: parla dels motius i dels tipus d'esdeveniment, on un `clau`
          nou necessita també una CHECK i una allowlist. Al final de tot queia
          just sota «Els avisos» i deia el contrari del que passa dues línies més
          avall, on el catàleg d'avisos SÍ que en deixa afegir. Es va veure
          obrint la pantalla, no llegint-la. */}
      {groups.slice(0, 2).map(group)}

      <p className="pb-9 text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {t('junta.config.scale.cantAdd')}
      </p>

      {groups.slice(2).map(group)}

      {save.isError ? (
        <p role="alert" className="pb-6 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(save.error))}
        </p>
      ) : null}
    </>
  )
}

/**
 * Un grup i les seves files.
 *
 * ÉS UN COMPONENT I NO UNA FUNCIÓ DINS DEL BLOC. Era un `renderGroups`
 * declarat sota el `return` —legal per l'hoisting i il·legible per a qui llegeix
 * de dalt a baix: el JSX de la pantalla apuntava a una funció que encara no
 * havia aparegut— i es tornava a crear a cada tecla. Amb un component, React
 * pot comparar-lo i el fitxer es llegeix en l'ordre en què passen les coses.
 */
function Group({
  heading,
  lede,
  name,
  hint,
  rows,
  edits,
  saved,
  pending,
  onType,
  onSave,
}: {
  readonly heading: string
  readonly lede?: string | undefined
  readonly name: (clau: string) => string
  /** Una línia sota el nom que diu què vol dir el número, si en té. */
  readonly hint: (clau: string) => string | null
  readonly rows: readonly PointValue[]
  readonly edits: Readonly<Record<string, string>>
  readonly saved: string | null
  /** La fila que s'està desant ara mateix, si n'hi ha cap. */
  readonly pending: PointValue | null
  readonly onType: (id: string, value: string) => void
  readonly onSave: (value: PointValue) => void
}) {
  const { t } = useTranslation()

  return (
    <section className="pb-9">
      <h3 className="eyebrow text-fg-muted">{heading}</h3>
      {lede === undefined ? null : (
        <p className="mt-3 text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">{lede}</p>
      )}
      <ul className="mt-2">
        {rows.map((row) => {
          const id = keyOf(row)
          const typed = edits[id]
          const shown = typed ?? String(row.punts)
          const parsed = Number(shown)
          const valid = shown !== '' && Number.isInteger(parsed) && parsed >= 0 && parsed <= LIMIT
          const busy = pending !== null && keyOf(pending) === id

          return (
            <li key={id} className={FILA}>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold [text-wrap:pretty]">
                  {name(row.clau)}
                </span>
                {hint(row.clau) === null ? null : (
                  <span className="mt-[2px] block text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
                    {hint(row.clau)}
                  </span>
                )}
              </span>

              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={LIMIT}
                value={shown}
                aria-label={name(row.clau)}
                onChange={(e) => {
                  onType(id, e.target.value)
                }}
                className="min-h-[46px] w-[86px] flex-none border-[1.5px] border-surface-7 bg-surface-1 px-4 text-center text-lg font-bold text-fg outline-none"
              />

              {typed === undefined ? (
                // Era un `<span>` verd i prou. Es veia igual que el
                // `role="status"` del catàleg d'avisos que té al costat i no
                // deia res a ningú que no mirés la pantalla: qui desa un número
                // amb el teclat no rebia cap resposta.
                // La ranura reserva l'amplada encara que estigui buida, o la
                // fila salta cada cop que el «Desat» apareix i marxa, i `min-w-`
                // perquè un botó creix, no es retalla.
                <div className="min-w-[76px] flex-none text-right">
                  <DoneLine size="sm" message={saved === id ? t('junta.config.saved') : null} />
                </div>
              ) : (
                // EL BOTÓ DINS D'UNA RANURA I NO SOLT. `<Button>` porta
                // `w-full` —és el que fa que un CTA ocupi la pantalla— i com a
                // fill directe d'aquesta fila aquell 100% s'emportava l'amplada
                // sencera i empenyia el nom i la caixeta fora. La ranura es mida
                // pel contingut, i el 100% del botó és el 100% d'ella.
                <div className="min-w-[76px] flex-none">
                  <Button
                    disabled={!valid || busy}
                    onClick={() => {
                      onSave({ ...row, punts: parsed })
                    }}
                  >
                    {busy ? '…' : t('actions.save')}
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

interface GroupSpec {
  readonly mena: string
  readonly key?: string
  readonly heading: string
  readonly lede?: string
  readonly name: (clau: string) => string
  /** Quines files del grup hi van, quan una mateixa `mena` es parteix en dos. */
  readonly only?: (clau: string) => boolean
}

const keyOf = (v: { readonly mena: string; readonly clau: string }) => `${v.mena}:${v.clau}`

/** Els cinc grups del barem: el nom de la fila i la caixeta del número. */
function ScaleSkeleton() {
  return (
    <Skeleton>
      <SkeletonBar w="w-[85%]" h="h-[14px]" className="mb-8" />
      {[0, 1, 2, 3, 4].map((group) => (
        <div key={group} className="pb-9">
          <SkeletonBar w="w-[36%]" h="h-[10px]" />
          <div className="mt-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={FILA}>
                <SkeletonBar w="w-[55%]" h="h-[18px]" className="flex-1" />
                <SkeletonBar w="w-[74px]" h="h-[44px]" className="flex-none" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Skeleton>
  )
}
