import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { formatDayMonth } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import type { EventType } from '@/lib/model'

import { INPUT } from './formBits'
import { fetchHoresEsdeveniment, horesKeys, setEventHores } from './horesApi'
import { type CampsHores, campsDesDeMinuts, minutsDesDeCamps } from './horesForm'

/**
 * Les hores de l'activitat, dins del formulari.
 *
 * ON CAU: just després de places, preu i punts. Llegit de dalt a baix, el
 * formulari diu quan és, on és i què val —i les hores són l'última d'aquestes
 * quatre. Va després de «quan acaba», que és d'on surt el número. La tira de
 * publicat es queda a dalt perquè és un estat que has de saber ABANS d'editar;
 * això és un camp més.
 *
 * ES DESA SOL, amb el seu botó, i el marc del bloc és el que ho diu. És el gest
 * del barem, que la junta ja coneix: el botó apareix en tocar res. Desar en
 * sortir del camp no serveix, perquè al mòbil el teclat es tanca per mil motius
 * que no són «ja està».
 *
 * PER QUÈ ES PREGUNTA, abans del control i no com a nota al peu: la pregunta
 * «i això per què?» arriba en veure l'interruptor, no després de contestar-lo.
 *
 * UNA CASA RURAL NO TÉ TIRA. La regla del formulari és que els camps
 * desapareixen en comptes de quedar-se buits, i un interruptor que no es pot
 * encendre mai és exactament això. La línia que ho explica sí que hi ha de ser
 * —sense ella sembla que la pantalla s'hagi trencat—, però una línia, no una
 * caixa.
 */

const BOX = 'mb-9 border border-surface-8 bg-surface-2 p-9'

export function HoresStrip({
  eventId,
  tipo,
  teFinal,
}: {
  readonly eventId: string
  readonly tipo: EventType
  /** Si el formulari té una hora de final escrita ara mateix. */
  readonly teFinal: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const client = useQueryClient()
  const [edits, setEdits] = useState<CampsHores | null>(null)
  const [uni, setUni] = useState<boolean | null>(null)

  const hores = useQuery({
    queryKey: horesKeys.event(eventId),
    queryFn: () => fetchHoresEsdeveniment(eventId),
  })

  const desa = useMutation({
    mutationFn: ({ minuts, aLaUni }: { minuts: number; aLaUni: boolean }) =>
      setEventHores(eventId, minuts, aLaUni),
    onSuccess: async () => {
      setEdits(null)
      setUni(null)
      await client.invalidateQueries({ queryKey: horesKeys.event(eventId) })
      await client.invalidateQueries({ queryKey: horesKeys.pendents() })
    },
  })

  if (tipo === 'casa_rural') {
    return (
      <p className="mb-9 text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
        {t('junta.hores.noCasaRural')}
      </p>
    )
  }

  const dades = hores.data
  const camps = edits ?? campsDesDeMinuts(dades?.minuts ?? 0)
  const aLaUni = uni ?? dades?.a_la_uni ?? false
  const minuts = minutsDesDeCamps(camps)
  const brut = edits !== null || uni !== null

  return (
    <div className={BOX}>
      <h3 className="eyebrow text-fg-muted">{t('junta.hores.stripTitle')}</h3>
      <p className="mt-[7px] text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
        {t('junta.hores.why')}
      </p>

      <button
        type="button"
        aria-pressed={aLaUni}
        disabled={dades === undefined}
        onClick={() => {
          setUni(!aLaUni)
        }}
        className={
          'mt-6 flex min-h-[56px] w-full items-center gap-5 px-6 py-4 text-left ' +
          (aLaUni
            ? 'border-[1.5px] border-brand-cta bg-[var(--ds-bg-live)]'
            : 'border-[1.5px] border-surface-7 bg-surface-1')
        }
      >
        <span
          aria-hidden="true"
          className={
            'grid size-[24px] flex-none place-items-center border-[1.5px] text-sm font-bold ' +
            (aLaUni ? 'border-brand-cta bg-brand-cta text-on-brand' : 'border-surface-7 text-transparent')
          }
        >
          ✓
        </span>
        <span className="min-w-0 flex-1 text-md font-bold [text-wrap:pretty]">
          {aLaUni ? t('junta.hores.atUniOn') : t('junta.hores.atUniOff')}
        </span>
      </button>

      {/* Sense hora de final el desat de l'esdeveniment ja no passa, o sigui
          que deixar tocar les hores aquí seria convidar a un carreró. Els camps
          no hi surten; l'avís i el botó apagat, sí. */}
      {teFinal ? (
        <>
          <div className="mt-7 grid grid-cols-2 gap-4">
            <Camp
              label={t('junta.hores.hours')}
              value={camps.hores}
              onChange={(v) => {
                setEdits({ ...camps, hores: v })
              }}
            />
            <Camp
              label={t('junta.hores.minutes')}
              value={camps.minuts}
              onChange={(v) => {
                setEdits({ ...camps, minuts: v })
              }}
            />
          </div>
          <p className="mt-4 text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
            {aLaUni ? t('junta.hores.hoursHint') : t('junta.hores.offHint')}
          </p>
        </>
      ) : (
        <p className="mt-6 text-sm font-semibold text-warning [text-wrap:pretty]">
          {t('junta.hores.needsEnd')}
        </p>
      )}

      {brut || desa.isPending ? (
        <button
          type="button"
          disabled={!teFinal || minuts === null || desa.isPending}
          onClick={() => {
            if (minuts !== null) desa.mutate({ minuts, aLaUni })
          }}
          className={
            'mt-7 flex min-h-[50px] w-full items-center justify-center px-6 py-4 text-md font-bold [text-wrap:balance] ' +
            (teFinal && minuts !== null && !desa.isPending
              ? 'bg-brand-cta text-on-brand'
              : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg-muted')
          }
        >
          {desa.isPending ? t('state.updating') : t('junta.hores.save')}
        </button>
      ) : desa.isSuccess ? (
        <p role="status" className="mt-7 text-md font-bold text-success">
          {t('junta.config.saved')}
        </p>
      ) : null}

      {desa.isError ? (
        <p role="alert" className="mt-6 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(desa.error))}
        </p>
      ) : null}

      {/* El visat es veu aquí, i no com un control: qui edita la durada d'una
          activitat ja visada ho ha de saber abans de tocar-la. */}
      <Link
        to={`/junta/esdeveniment/${eventId}/hores`}
        className="mt-7 flex min-h-[56px] items-center justify-between gap-5 border border-surface-8 bg-surface-1 px-7 py-6 text-fg no-underline"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-md font-bold [text-wrap:balance]">
            {t('junta.hores.eachPerson')}
          </span>
          {dades === undefined ? null : (
            <span className="mt-[3px] block text-sm-lo [text-wrap:pretty]">
              <span
                className={
                  dades.visat_at === null
                    ? 'font-bold text-warning-deep'
                    : 'font-bold text-success'
                }
              >
                {dades.visat_at === null
                  ? t('junta.hores.unsigned')
                  : t('junta.hores.signedOn', {
                      data: formatDayMonth(new Date(dades.visat_at), locale),
                    })}
              </span>
              <span className="text-fg-muted-lo">
                {' · '}
                {t('junta.hores.people', { count: dades.persones })}
              </span>
            </span>
          )}
        </span>
        <span aria-hidden="true" className="flex-none text-lg text-fg-muted">
          ›
        </span>
      </Link>
    </div>
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
        // Dues caixes sense etiqueta serien una endevinalla, i `Field` posa el
        // nom al grup: cada control necessita el seu.
        aria-label={label}
        className={`${INPUT} text-center`}
      />
    </div>
  )
}
