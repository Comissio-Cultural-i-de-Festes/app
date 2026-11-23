import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchDemanaViatger, viatgerKeys } from '@/features/event/viatgerApi'
import { errorKey } from '@/lib/errors'
import type { EventType } from '@/lib/model'
import { Confirm } from '@/ui/Confirm/Confirm'
import { DoneLine } from '@/ui/Notice/DoneLine'
import { NavRow } from '@/ui/Row/Row'

import { Field } from './formBits'
import { fetchApuntats, setDemana, viatgersKeys } from './viatgersApi'

/**
 * La casella «demana dades de viatger», al formulari de l'esdeveniment.
 *
 * ES DESA A L'ACTE, i no amb el «Desa» del formulari. No és un camp
 * d'`admin_save_event` sinó la seva pròpia RPC (vegeu la migració 90), i el que
 * fa en treure-la —esborrar les dades que ja hi ha— no pot esperar que algú
 * premi un altre botó al final de la pantalla sense saber que també feia això.
 * Per això treure-la, si hi ha dades, demana confirmació amb el nombre de
 * persones; posar-la no esborra res i no en demana.
 *
 * NOMÉS D'UN ESDEVENIMENT QUE EXISTEIX. La RPC necessita l'id; en un de nou, el
 * bloc diu que primer s'ha de desar. Una reunió no en demana: ningú no hi dorm.
 *
 * MOSTRA'L EN UNA CASA RURAL, o on ja estigui posada. En una festa no hi pinta
 * res, però si algú l'hi va posar s'ha de poder treure.
 */

export function DemanaViatgerBlock({
  eventId,
  tipo,
}: {
  readonly eventId: string | null
  readonly tipo: EventType
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [segur, setSegur] = useState(false)
  const [fet, setFet] = useState<string | null>(null)

  const demana = useQuery({
    queryKey: viatgerKeys.demana(eventId ?? ''),
    queryFn: () => fetchDemanaViatger(eventId ?? ''),
    enabled: eventId !== null,
  })
  const apuntats = useQuery({
    queryKey: viatgersKeys.llista(eventId ?? ''),
    queryFn: () => fetchApuntats(eventId ?? ''),
    enabled: eventId !== null && demana.data === true,
  })

  const canvia = useMutation({
    mutationFn: (a: boolean) => setDemana(eventId ?? '', a),
    onSuccess: async (esborrades, a) => {
      setSegur(false)
      setFet(
        a
          ? t('junta.viatgers.flag.turnedOn')
          : esborrades === 0
            ? t('junta.viatgers.flag.turnedOff')
            : t('junta.viatgers.flag.removed', { count: esborrades }),
      )
      await client.invalidateQueries({ queryKey: viatgerKeys.demana(eventId ?? '') })
      await client.invalidateQueries({ queryKey: viatgersKeys.llista(eventId ?? '') })
    },
  })

  if (tipo === 'reunio') return null
  if (eventId === null) {
    return tipo === 'casa_rural' ? (
      <Field label={t('junta.viatgers.flag.label')}>
        <p className="mt-4 border-[1.5px] border-dashed border-surface-7 px-6 py-5 text-md text-fg-muted [text-wrap:pretty]">
          {t('junta.viatgers.flag.newEvent')}
        </p>
      </Field>
    ) : null
  }
  if (tipo !== 'casa_rural' && demana.data !== true) return null

  const on = demana.data === true
  const llista = apuntats.data ?? []
  const posades = llista.filter((a) => a.te_dades).length

  return (
    <Field label={t('junta.viatgers.flag.label')} hint={t('junta.viatgers.flag.hint')}>
      <button
        type="button"
        aria-pressed={on}
        disabled={demana.isPending || canvia.isPending}
        onClick={() => {
          setFet(null)
          if (!on) canvia.mutate(true)
          else if (posades > 0) setSegur(true)
          else canvia.mutate(false)
        }}
        className={
          'mt-4 flex min-h-[56px] w-full items-center gap-5 px-6 py-4 text-left disabled:opacity-45 ' +
          (on
            ? 'border-[1.5px] border-brand-cta bg-[var(--ds-bg-live)]'
            : 'border-[1.5px] border-surface-7 bg-surface-1')
        }
      >
        <span
          aria-hidden="true"
          className={
            'grid size-[24px] flex-none place-items-center border-[1.5px] text-sm font-bold ' +
            (on
              ? 'border-brand-cta bg-brand-cta text-on-brand'
              : 'border-surface-7 text-transparent')
          }
        >
          ✓
        </span>
        <span className="min-w-0 flex-1 text-md font-bold [text-wrap:pretty]">
          {canvia.isPending
            ? t('state.saving')
            : on
              ? t('junta.viatgers.flag.on')
              : t('junta.viatgers.flag.off')}
        </span>
      </button>

      {segur ? (
        <Confirm
          className="mt-5 border border-warning p-7"
          cta={t('junta.viatgers.flag.sureCta')}
          cancel={t('actions.cancel')}
          busy={canvia.isPending}
          onConfirm={() => {
            canvia.mutate(false)
          }}
          onCancel={() => {
            setSegur(false)
          }}
        >
          <p className="text-md font-bold [text-wrap:pretty]">
            {t('junta.viatgers.flag.sure', { count: posades })}
          </p>
        </Confirm>
      ) : null}

      <DoneLine size="sm" className="mt-4" message={fet} />

      {canvia.isPaused ? (
        <p role="status" className="mt-4 text-sm font-bold text-warning [text-wrap:pretty]">
          {t('junta.viatgers.flag.paused')}
        </p>
      ) : null}

      {canvia.isError ? (
        <p role="alert" className="mt-4 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(canvia.error))}
        </p>
      ) : null}

      {on ? (
        <div className="mt-4">
          <NavRow
            to={`/junta/esdeveniment/${eventId}/viatgers`}
            title={t('junta.viatgers.title')}
            sub={
              apuntats.isSuccess
                ? t('junta.viatgers.summary', { posades, total: llista.length })
                : undefined
            }
          />
        </div>
      ) : null}
    </Field>
  )
}
