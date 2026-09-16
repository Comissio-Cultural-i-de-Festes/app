import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { errorKey } from '@/lib/errors'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { nomDelTipus } from './avisTipus'
import { avisosKeys, fetchAvisTipus, saveAvisTipus } from './avisosApi'
import { Field, INPUT } from './formBits'

/**
 * El catàleg d'avisos, al costat de la resta del barem.
 *
 * VIU AQUÍ I NO EN UNA PANTALLA PRÒPIA perquè és la mateixa pregunta que ja
 * respon `/junta/barem`: quant val una cosa. Que els punts d'una proposta i el
 * pes d'un avís s'editin a dos llocs diferents seria dues pantalles que la
 * junta ha d'aprendre en comptes d'una.
 *
 * PER QUÈ AQUÍ SÍ QUE ES POT AFEGIR UNA FILA, i a `ScaleBlock` no. Allà un
 * `clau` nou necessita també una CHECK i una allowlist dins `award_points`, o
 * sigui que la fila sola seria un botó que falla el dia que algú el premi —hi
 * ha una frase al peu de la pantalla que ho diu—. Aquí `avisos.tipus` és una
 * clau forana i prou: no hi ha cap allowlist enlloc, i una fila nova és tot el
 * que cal perquè el tipus funcioni.
 *
 * ELS PUNTS SUGGERITS NO SÓN ELS PUNTS DE L'AVÍS. Només precarreguen el
 * formulari; un cop l'avís existeix, els seus són els seus. Re-afinar això al
 * juny no reescriu què va valer una nit d'octubre, i la frase del peu ho diu
 * perquè és la mena de cosa que s'assumeix al revés.
 */

interface Draft {
  readonly gravetat: string
  readonly punts: string
  readonly actiu: boolean
}

export function AvisTipusBlock() {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()

  /**
   * La traducció d'un tipus, o cadena buida si no en té.
   *
   * ES PREGUNTA AMB `i18n.exists` I NO AMB `defaultValue: ''`. Aquesta app
   * arrenca amb `returnEmptyString: false` (`src/i18n/index.ts`), i amb aquesta
   * opció i18next descarta una cadena buida i torna LA CLAU. O sigui que el
   * `defaultValue: ''` que hi havia aquí no tornava mai '' i el recanvi de
   * `nomDelTipus` no s'arribava a disparar: un tipus afegit per la junta sortia
   * a la pantalla com «avisos.tipus.se_en_va_aviat». Es va veure afegint-ne un
   * de debò a la pantalla, no llegint el codi.
   */
  const traduccio = (clau: string): string =>
    i18n.exists(`avisos.tipus.${clau}`) ? t(`avisos.tipus.${clau}`) : ''
  const [edits, setEdits] = useState<Record<string, Draft>>({})
  const [saved, setSaved] = useState<string | null>(null)
  const [nou, setNou] = useState({ clau: '', etiqueta: '', gravetat: '1', punts: '0' })

  const tipus = useQuery({ queryKey: avisosKeys.tipus(), queryFn: fetchAvisTipus })

  const save = useMutation({
    mutationFn: saveAvisTipus,
    onSuccess: async (_data, v) => {
      setEdits((previous) => {
        const next = { ...previous }
        delete next[v.clau]
        return next
      })
      setSaved(v.clau)
      await client.invalidateQueries({ queryKey: avisosKeys.tipus() })
    },
  })

  const create = useMutation({
    mutationFn: saveAvisTipus,
    onSuccess: async () => {
      setNou({ clau: '', etiqueta: '', gravetat: '1', punts: '0' })
      await client.invalidateQueries({ queryKey: avisosKeys.tipus() })
    },
  })

  if (tipus.isPending) return <AvisTipusSkeleton />
  if (tipus.isError) {
    return (
      <p role="alert" className="text-md font-bold text-error [text-wrap:pretty]">
        {t(errorKey(tipus.error))}
      </p>
    )
  }

  const rows = tipus.data
  const clauNova = nou.clau.trim()
  const clauValida = /^[a-z][a-z_]{0,23}$/.test(clauNova)
  const jaHiEs = rows.some((r) => r.clau === clauNova)
  const gravetatNova = Number(nou.gravetat)
  const puntsNous = Number(nou.punts)
  const potCrear =
    clauValida &&
    !jaHiEs &&
    Number.isInteger(gravetatNova) &&
    gravetatNova >= 1 &&
    gravetatNova <= 3 &&
    Number.isInteger(puntsNous) &&
    puntsNous <= 0 &&
    puntsNous >= -500

  // La ratlla de dalt separa el catàleg del barem de punts. Sense ella, el
  // títol d'aquí queia enganxat a l'última línia del bloc anterior i les dues
  // seccions es llegien com una de sola. Es va veure obrint la pantalla.
  return (
    <section className="mt-9 border-t border-surface-4 pt-9 pb-9">
      <h3 className="eyebrow text-fg-muted">{t('junta.config.avisos.heading')}</h3>
      <p className="pt-4 text-md text-fg-secondary [text-wrap:pretty]">
        {t('junta.config.avisos.lede')}
      </p>

      <ul className="mt-6">
        {rows.map((row) => {
          const draft = edits[row.clau]
          const gravetat = draft?.gravetat ?? String(row.gravetat)
          const punts = draft?.punts ?? String(row.punts_suggerits)
          const actiu = draft?.actiu ?? row.actiu
          const g = Number(gravetat)
          const p = Number(punts)
          const valid =
            gravetat !== '' &&
            punts !== '' &&
            Number.isInteger(g) &&
            g >= 1 &&
            g <= 3 &&
            Number.isInteger(p) &&
            p <= 0 &&
            p >= -500
          const busy = save.isPending && save.variables?.clau === row.clau

          const change = (patch: Partial<Draft>) => {
            setSaved(null)
            setEdits((previous) => ({
              ...previous,
              [row.clau]: {
                gravetat: previous[row.clau]?.gravetat ?? String(row.gravetat),
                punts: previous[row.clau]?.punts ?? String(row.punts_suggerits),
                actiu: previous[row.clau]?.actiu ?? row.actiu,
                ...patch,
              },
            }))
          }

          return (
            <li key={row.clau} className="border-b border-surface-4 py-6">
              <div className="flex min-h-[46px] items-center gap-5">
                <span
                  className={
                    'min-w-0 flex-1 text-lg font-semibold [text-wrap:pretty] ' +
                    (actiu ? '' : 'text-fg-muted line-through')
                  }
                >
                  {nomDelTipus(row, traduccio(row.clau))}
                </span>
                <button
                  type="button"
                  aria-pressed={actiu}
                  onClick={() => {
                    change({ actiu: !actiu })
                  }}
                  className={
                    'min-h-[46px] flex-none px-5 text-sm font-bold [text-wrap:balance] ' +
                    (actiu
                      ? 'border-[1.5px] border-surface-7 bg-surface-1 text-fg-secondary'
                      : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg-muted')
                  }
                >
                  {actiu ? t('junta.config.avisos.inUse') : t('junta.config.avisos.retired')}
                </button>
              </div>

              <div className="mt-5 flex items-end gap-5">
                <label className="min-w-0 flex-1">
                  <span className="block eyebrow text-fg-muted">
                    {t('junta.config.avisos.gravetat')}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={3}
                    value={gravetat}
                    onChange={(e) => {
                      change({ gravetat: e.target.value })
                    }}
                    className="mt-2 min-h-[46px] w-full border-[1.5px] border-surface-7 bg-surface-1 px-4 text-center text-lg font-bold text-fg outline-none"
                  />
                </label>

                <label className="min-w-0 flex-1">
                  <span className="block eyebrow text-fg-muted">
                    {t('junta.config.avisos.punts')}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={-500}
                    max={0}
                    value={punts}
                    onChange={(e) => {
                      change({ punts: e.target.value })
                    }}
                    className="mt-2 min-h-[46px] w-full border-[1.5px] border-surface-7 bg-surface-1 px-4 text-center text-lg font-bold text-fg outline-none"
                  />
                </label>

                {draft === undefined ? (
                  <span className="min-h-[46px] w-[90px] flex-none pt-7 text-right text-sm font-bold text-success">
                    {saved === row.clau ? t('junta.config.saved') : ''}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!valid || busy}
                    onClick={() => {
                      save.mutate({
                        clau: row.clau,
                        gravetat: g,
                        punts_suggerits: p,
                        ordre: row.ordre,
                        etiqueta: row.etiqueta,
                        actiu,
                      })
                    }}
                    className="min-h-[46px] w-[90px] flex-none bg-brand-cta px-3 text-sm font-bold text-on-brand disabled:opacity-50"
                  >
                    {busy ? '…' : t('actions.save')}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {save.isError ? (
        <p role="alert" className="pt-6 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(save.error))}
        </p>
      ) : null}

      {/* ── un de nou ── */}
      <div className="pt-9">
        <Field label={t('junta.config.avisos.newHeading')} hint={t('junta.config.avisos.newHint')}>
          <input
            value={nou.clau}
            onChange={(e) => {
              setNou((p) => ({ ...p, clau: e.target.value }))
            }}
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label={t('junta.config.avisos.newClau')}
            placeholder={t('junta.config.avisos.newClau')}
            className={INPUT}
          />
          <input
            value={nou.etiqueta}
            onChange={(e) => {
              setNou((p) => ({ ...p, etiqueta: e.target.value }))
            }}
            type="text"
            maxLength={40}
            aria-label={t('junta.config.avisos.newEtiqueta')}
            placeholder={t('junta.config.avisos.newEtiqueta')}
            className={INPUT}
          />
          <div className="mt-4 flex items-end gap-5">
            <label className="min-w-0 flex-1">
              <span className="block eyebrow text-fg-muted">
                {t('junta.config.avisos.gravetat')}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={3}
                value={nou.gravetat}
                onChange={(e) => {
                  setNou((p) => ({ ...p, gravetat: e.target.value }))
                }}
                className="mt-2 min-h-[46px] w-full border-[1.5px] border-surface-7 bg-surface-1 px-4 text-center text-lg font-bold text-fg outline-none"
              />
            </label>
            <label className="min-w-0 flex-1">
              <span className="block eyebrow text-fg-muted">{t('junta.config.avisos.punts')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={-500}
                max={0}
                value={nou.punts}
                onChange={(e) => {
                  setNou((p) => ({ ...p, punts: e.target.value }))
                }}
                className="mt-2 min-h-[46px] w-full border-[1.5px] border-surface-7 bg-surface-1 px-4 text-center text-lg font-bold text-fg outline-none"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={!potCrear || create.isPending}
            onClick={() => {
              create.mutate({
                clau: clauNova,
                gravetat: gravetatNova,
                punts_suggerits: puntsNous,
                ordre: rows.length + 1,
                etiqueta: nou.etiqueta.trim() === '' ? null : nou.etiqueta.trim(),
                actiu: true,
              })
            }}
            className="mt-6 min-h-[50px] w-full bg-brand-cta px-5 text-md font-bold text-on-brand disabled:opacity-50"
          >
            {create.isPending ? '…' : t('junta.config.avisos.newCta')}
          </button>
        </Field>

        {create.isError ? (
          <p role="alert" className="pb-6 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(create.error))}
          </p>
        ) : null}
      </div>
    </section>
  )
}

function AvisTipusSkeleton() {
  return (
    <Skeleton>
      <SkeletonBar w="w-[40%]" h="h-[10px]" />
      <SkeletonBar w="w-[80%]" h="h-[14px]" className="mt-4" />
      <div className="mt-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border-b border-surface-4 py-6">
            <SkeletonBar w="w-[55%]" h="h-[18px]" />
            <div className="mt-5 flex gap-5">
              <SkeletonBar w="w-full" h="h-[44px]" className="flex-1" />
              <SkeletonBar w="w-full" h="h-[44px]" className="flex-1" />
              <SkeletonBar w="w-[90px]" h="h-[44px]" className="flex-none" />
            </div>
          </div>
        ))}
      </div>
    </Skeleton>
  )
}
