import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { formatDateLong, formatDayMonth, formatHores, formatTime, horesParts } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { JuntaHeader } from './JuntaHeader'
import { INPUT } from './formBits'
import {
  type HoresPersona,
  fetchHoresEsdeveniment,
  horesKeys,
  setHoresPersona,
  visaHores,
} from './horesApi'
import { type CampsHores, campsDesDeMinuts, minutsDesDeCamps } from './horesForm'

/**
 * Les hores d'una activitat, persona a persona.
 *
 * L'ORDRE: capçalera, llista, i el botó de visar a baix de tot. Visar és signar
 * el que hi ha a la llista, i un botó a sobre del que aprova és un botó que es
 * prem abans de llegir. L'estat sí que va a dalt, perquè s'ha de saber en
 * entrar.
 *
 * LES HORES D'ENTRADA I SORTIDA ES VEUEN perquè són d'on surt el número: sense
 * elles la junta no pot dir si un «4 h 05» és plausible.
 *
 * L'EXCEPCIÓ ÉS INFORMACIÓ, NO COLOR. «A mà» i, tot seguit, què deia el càlcul.
 * Ni ambre —no és feina pendent— ni la marca de la comi, que aquí no vol dir
 * res. L'únic canvi de to és el fons de la fila oberta, i és de l'edició.
 *
 * ELS CAMPS NO SÓN A TOTES LES FILES. Vint-i-dues files amb dues caixetes cada
 * una són un formulari que ningú no llegeix: es desplega tocant «Canvia», com
 * la confirmació de Socis.
 *
 * I UN COP VISAT no hi ha cap «Canvia»: per tocar una hora signada s'ha de
 * desfer el vist primer. Aquesta és la fricció, i la RPC la torna a demanar per
 * si algú se salta la pantalla.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function HoresEventScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const { id } = useParams()
  const eventId = id ?? ''
  const client = useQueryClient()
  const [desfent, setDesfent] = useState(false)
  // Una sola lectura del rellotge per render, com la pantalla de dins.
  const [ara] = useState(() => Date.now())

  const hores = useQuery({
    queryKey: horesKeys.event(eventId),
    queryFn: () => fetchHoresEsdeveniment(eventId),
    enabled: eventId !== '',
  })

  const refresca = async () => {
    await client.invalidateQueries({ queryKey: horesKeys.event(eventId) })
    await client.invalidateQueries({ queryKey: horesKeys.socis() })
    await client.invalidateQueries({ queryKey: horesKeys.pendents() })
  }

  const visa = useMutation({
    mutationFn: (visat: boolean) => visaHores(eventId, visat),
    onSuccess: async () => {
      setDesfent(false)
      await refresca()
    },
  })

  const dades = hores.data
  const visat = dades?.visat_at ?? null

  // Visar una activitat que encara no s'ha acabat és signar un número que
  // continuarà movent-se: les hores es calculen a cada lectura, i qui fitxi
  // després apareixeria com a visat sense que ningú ho hagi mirat. La marca no
  // congela res, i per això la porta és el temps i no un candau.
  const acabada =
    dades === undefined
      ? false
      : ara >= Date.parse(dades.ends_at ?? dades.starts_at)

  return (
    <main className="min-h-dvh bg-app pb-[calc(var(--ds-safe-bottom)+32px)]">
      <JuntaHeader
        to={`/junta/esdeveniment/${eventId}`}
        label={dades?.titol ?? t('actions.back')}
        title={t('junta.hores.title')}
      />

      <p className={`pt-7 text-sm text-fg-secondary [text-wrap:pretty] ${GUTTER}`}>
        {t('junta.hores.lede')}
      </p>

      {hores.isError ? (
        <p role="alert" className={`pt-10 text-md font-bold text-error [text-wrap:pretty] ${GUTTER}`}>
          {t(errorKey(hores.error))}
        </p>
      ) : dades === undefined ? (
        <HoresEventSkeleton />
      ) : (
        <>
          <section className="mt-8 border-y border-surface-7 bg-surface-1">
            <div className={`pt-8 ${GUTTER}`}>
              <p
                className={`eyebrow-sm ${visat === null ? 'text-warning-deep' : 'text-success'}`}
              >
                {/* Aquí només l'estat: la data i qui el va posar viuen a l'avís
                    del final, al costat del botó de desfer-lo. */}
                {visat === null ? t('junta.hores.unsigned') : t('junta.hores.signed')}
              </p>
              <p className="mt-4 text-base font-semibold text-fg-secondary [text-wrap:pretty]">
                {formatDateLong(new Date(dades.starts_at), locale)}
                {dades.ends_at === null
                  ? ''
                  : ` → ${formatTime(new Date(dades.ends_at), locale)}`}
              </p>
            </div>
            <div className="mt-7 grid grid-cols-3 border-t border-surface-4">
              <Xifra minuts={dades.minuts} label={t('junta.hores.duration')} />
              <Compte n={dades.persones} label={t('junta.hores.persons')} />
              <Xifra minuts={dades.minuts_totals} label={t('junta.hores.inTotal')} />
            </div>
          </section>

          {dades.gent.length === 0 ? (
            <p className={`pt-10 text-md text-fg-muted [text-wrap:pretty] ${GUTTER}`}>
              {t('junta.hores.nobody')}
            </p>
          ) : (
            <ul className="pt-7">
              {dades.gent.map((persona) => (
                <Fila
                  key={persona.user_id}
                  eventId={eventId}
                  persona={persona}
                  editable={visat === null}
                  onSaved={refresca}
                />
              ))}
            </ul>
          )}

          <section className={`pt-12 ${GUTTER}`}>
            {visat === null && !acabada ? (
              <p className="text-md text-fg-muted [text-wrap:pretty]">
                {t('junta.hores.notOverYet')}
              </p>
            ) : visat === null ? (
              <>
                <button
                  type="button"
                  disabled={visa.isPending}
                  onClick={() => {
                    visa.mutate(true)
                  }}
                  className="flex min-h-[60px] w-full items-center justify-center bg-brand-cta px-8 py-4 text-2xl font-bold text-on-brand shadow-brand [text-wrap:balance] disabled:opacity-70"
                >
                  {visa.isPending ? t('state.updating') : t('junta.hores.sign')}
                </button>
                <p className="mt-4 text-center text-sm text-fg-muted-lo [text-wrap:pretty]">
                  {dades.persones === 0
                    ? t('junta.hores.signNobody')
                    : t('junta.hores.signSub', {
                        gent: t('junta.hores.people', { count: dades.persones }),
                      })}
                </p>
              </>
            ) : (
              <>
                <div className="border-l-[3px] border-success bg-surface-2 px-9 py-7">
                  <p className="text-base font-bold [text-wrap:pretty]">
                    {t('junta.hores.signedBy', {
                      data: formatDayMonth(new Date(visat), locale),
                      qui: dades.visat_per ?? '—',
                    })}
                  </p>
                  <p className="tabular mt-3 text-sm text-fg-muted [text-wrap:pretty]">
                    {t('junta.hores.signedSub', {
                      gent: t('junta.hores.people', { count: dades.persones }),
                      h: formatHores(dades.minuts_totals, locale),
                    })}
                  </p>
                </div>

                {/* Un pas de confirmació i no més, el mateix que despublicar:
                    això toca el perfil de tothom qui hi era. */}
                {desfent ? (
                  <div className="mt-4 border-t border-surface-5 pt-9">
                    <p className="text-md font-bold [text-wrap:pretty]">
                      {t('junta.hores.unsignAsk', {
                        gent: t('junta.hores.people', { count: dades.persones }),
                      })}
                    </p>
                    <div className="mt-6 flex gap-4">
                      <button
                        type="button"
                        disabled={visa.isPending}
                        onClick={() => {
                          visa.mutate(false)
                        }}
                        className="min-h-[48px] flex-1 border-[1.5px] border-warning px-6 text-md font-bold text-warning disabled:opacity-70"
                      >
                        {t('junta.hores.unsign')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDesfent(false)
                        }}
                        className="min-h-[48px] flex-1 border-[1.5px] border-surface-7 px-6 text-md font-bold text-fg-secondary"
                      >
                        {t('actions.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDesfent(true)
                    }}
                    className="mt-9 min-h-[48px] w-full text-md font-bold text-warning"
                  >
                    {t('junta.hores.unsign')}
                  </button>
                )}
              </>
            )}

            {visa.isError ? (
              <p role="alert" className="pt-6 text-md font-bold text-error [text-wrap:pretty]">
                {t(errorKey(visa.error))}
              </p>
            ) : null}
          </section>
        </>
      )}
    </main>
  )
}

function Fila({
  eventId,
  persona,
  editable,
  onSaved,
}: {
  readonly eventId: string
  readonly persona: HoresPersona
  readonly editable: boolean
  readonly onSaved: () => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const [camps, setCamps] = useState<CampsHores | null>(null)

  const desa = useMutation({
    mutationFn: (minuts: number | null) => setHoresPersona(eventId, persona.user_id, minuts),
    onSuccess: async () => {
      setCamps(null)
      await onSaved()
    },
  })

  const minuts = camps === null ? null : minutsDesDeCamps(camps)
  const desconegut = persona.minuts === null

  return (
    <li className={`border-b border-surface-4 ${camps === null ? '' : 'bg-surface-1'}`}>
      <div className={`flex flex-wrap items-center gap-5 py-6 ${GUTTER}`}>
        <Avatar src={persona.avatar_url} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-fg">{persona.nombre}</span>
          <span className="mt-2 block text-sm-lo text-fg-muted [text-wrap:pretty]">
            <Marques persona={persona} />
          </span>
        </span>
        <span
          className={
            'tabular flex-none text-base font-extrabold ' + (desconegut ? 'text-fg-faint' : '')
          }
        >
          {desconegut ? '—' : formatHores(persona.minuts ?? 0, locale)}
        </span>
        {editable && camps === null ? (
          <button
            type="button"
            onClick={() => {
              setCamps(campsDesDeMinuts(persona.minuts ?? persona.minuts_calcul ?? 0))
            }}
            className="min-h-[44px] flex-none px-3 text-sm font-bold text-fg-muted"
          >
            {t('junta.hores.change')}
          </button>
        ) : null}
      </div>

      {camps === null ? null : (
        <div className={`pb-7 ${GUTTER}`}>
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-4">
            <Camp
              label={t('junta.hores.hours')}
              value={camps.hores}
              onChange={(v) => {
                setCamps({ ...camps, hores: v })
              }}
            />
            <Camp
              label={t('junta.hores.minutes')}
              value={camps.minuts}
              onChange={(v) => {
                setCamps({ ...camps, minuts: v })
              }}
            />
            <button
              type="button"
              disabled={minuts === null || desa.isPending}
              onClick={() => {
                if (minuts !== null) desa.mutate(minuts)
              }}
              className="min-h-[46px] w-[76px] flex-none bg-brand-cta px-3 text-sm font-bold text-on-brand disabled:opacity-50"
            >
              {desa.isPending ? '…' : t('actions.save')}
            </button>
          </div>

          {/* Buidar el camp no serveix per treure l'excepció: «buit» no es
              distingeix de «zero». Un botó que ho digui, sí. */}
          {persona.excepcio ? (
            <button
              type="button"
              disabled={desa.isPending}
              onClick={() => {
                desa.mutate(null)
              }}
              className="mt-6 min-h-[44px] text-md font-bold text-fg-muted disabled:opacity-60"
            >
              {t('junta.hores.backToCalc')}
            </button>
          ) : null}

          {desa.isError ? (
            <p role="alert" className="pt-4 text-md font-bold text-error [text-wrap:pretty]">
              {t(errorKey(desa.error))}
            </p>
          ) : null}
        </div>
      )}
    </li>
  )
}

/** L'entrada i la sortida, i què deia el càlcul si algú l'ha canviat. */
function Marques({ persona }: { readonly persona: HoresPersona }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)

  const entra =
    persona.checked_in_at === null ? null : formatTime(new Date(persona.checked_in_at), locale)
  const surt =
    persona.exit_photo_at === null ? null : formatTime(new Date(persona.exit_photo_at), locale)

  return (
    <>
      {persona.excepcio ? (
        <>
          <span className="eyebrow-sm text-fg-secondary">{t('junta.hores.byHand')}</span>
          {' · '}
        </>
      ) : null}
      {entra === null && surt === null ? null : (
        <span className="tabular">
          {entra ?? '—'} →{' '}
          {surt ?? (
            <span className="font-bold text-warning-deep">{t('junta.hores.noExit')}</span>
          )}
        </span>
      )}
      {persona.excepcio && persona.minuts_calcul !== null ? (
        <span className="tabular">
          {entra === null && surt === null ? '' : ' · '}
          {t('junta.hores.calcSaid', { h: formatHores(persona.minuts_calcul, locale) })}
        </span>
      ) : null}
    </>
  )
}

function Xifra({ minuts, label }: { readonly minuts: number; readonly label: string }) {
  const { i18n } = useTranslation()
  const { xifra, unitat } = horesParts(minuts, toLocale(i18n.resolvedLanguage))
  return (
    <div className="border-l border-surface-4 px-7 py-6 first:border-l-0">
      <p className="display tabular leading-[0.9] tracking-[-0.05em]">
        <span className="text-d-s">{xifra}</span>
        <span className="ml-3 text-d-xs">{unitat}</span>
      </p>
      <p className="eyebrow mt-3 text-fg-muted-lo">{label}</p>
    </div>
  )
}

function Compte({ n, label }: { readonly n: number; readonly label: string }) {
  return (
    <div className="border-l border-surface-4 px-7 py-6 first:border-l-0">
      <p className="display tabular text-d-s leading-[0.9] tracking-[-0.05em]">{String(n)}</p>
      <p className="eyebrow mt-3 text-fg-muted-lo">{label}</p>
    </div>
  )
}

/** La capçalera amb els tres números, i quatre files. */
function HoresEventSkeleton() {
  return (
    <Skeleton className="pt-8">
      <div className="grid grid-cols-3 border-y border-surface-7 bg-surface-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="px-7 py-6">
            <SkeletonBar w="w-[54px]" h="h-[26px]" />
            <SkeletonBar w="w-[42px]" h="h-[9px]" className="mt-3" />
          </div>
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`flex items-center gap-5 border-b border-surface-4 py-6 ${GUTTER}`}>
          <SkeletonBar w="w-[36px]" h="h-[36px]" className="flex-none rounded-round" />
          <div className="min-w-0 flex-1">
            <SkeletonBar w="w-[50%]" h="h-[14px]" />
            <SkeletonBar w="w-[70%]" h="h-[10px]" className="mt-3" />
          </div>
          <SkeletonBar w="w-[52px]" h="h-[13px]" className="flex-none" />
        </div>
      ))}
    </Skeleton>
  )
}

function Camp({
  label,
  value,
  onChange,
}: {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
}) {
  return (
    <div>
      <span className="block eyebrow text-fg-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        aria-label={label}
        className={`${INPUT} min-h-[46px] text-center`}
      />
    </div>
  )
}
