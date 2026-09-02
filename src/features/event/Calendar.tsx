import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDayMonth, formatTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import type { CalendarEvent } from '@/lib/ics'
import type { EventRow } from '@/lib/schema'

import { downloadIcs, markAdded, markDeclined, wasAdded, wasDeclined } from './icsStore'
import { CalendarIcon } from './icons'
import { titleIsHidden } from './title'

/**
 * Al calendari del telèfon: la proposta i la fila permanent.
 *
 * ES PROPOSA EN EL MOMENT QUE TÉ SENTIT —acabes de dir que sí— i després es
 * queda com una fila permanent, per si aquell dia vas de pressa. Les dues
 * coses són el mateix component amb dues cares, i no dues idees diferents.
 *
 * LA PROPOSTA VA DINS DE L'AVÍS QUE JA CONFIRMA EL SÍ i no com una capa a
 * sobre. La decisió acabada de prendre i la proposta són la mateixa frase; un
 * modal a sobre del «has dit que sí» seria una segona pantalla per a una cosa
 * que es contesta amb un toc.
 *
 * I «NO, GRÀCIES» ÉS PER SEMPRE per a aquest esdeveniment. No és un
 * ajornament: si tornés a sortir cada vegada que s'obre la pantalla, seria un
 * avís que la gent aprèn a saltar-se. La fila permanent, en canvi, no marxa
 * mai —és on hi tornarà qui canviï d'opinió.
 *
 * UN ESDEVENIMENT SENSE REVELAR NO EN TÉ. No hi ha res a posar-hi: ni títol,
 * ni lloc, ni hora de final. `titleIsHidden` és la mateixa comprovació que fa
 * la resta de la pantalla.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

function toCalendarEvent(event: EventRow): CalendarEvent {
  return {
    id: event.id,
    titol: event.titulo ?? '',
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    ubicacio: event.ubicacion,
    descripcio: event.descripcion,
  }
}

/**
 * La proposta, dins de l'avís del sí.
 *
 * Torna `null` quan no toca —no s'ha dit que sí, ja s'ha afegit, ja s'ha dit
 * que no, o encara no es pot dir què és— i per tant qui la crida no ha de
 * comprovar res.
 */
export function CalendarOffer({ event }: { readonly event: EventRow }) {
  const { t } = useTranslation()
  const [gone, setGone] = useState(false)
  const [failed, setFailed] = useState(false)

  if (titleIsHidden(event.titulo)) return null
  if (gone || wasAdded(event.id) || wasDeclined(event.id)) return null

  return (
    <div className="mt-7 border-t border-surface-5 pt-7">
      <p className="text-md font-bold leading-[1.35] [text-wrap:pretty]">
        {t('event.calendar.offerTitle')}
      </p>
      <p className="mt-3 text-sm-lo leading-[1.4] text-fg-muted-lo [text-wrap:pretty]">
        {t('event.calendar.offerBody')}
      </p>

      <div className="mt-6 flex gap-4">
        <button
          type="button"
          onClick={() => {
            // Es marca abans de baixar: si l'escriptura falla —Safari en
            // privat llança— val més una marca d'una descàrrega que no ha
            // passat que oferir-la per sempre a qui ja la té. La fila
            // permanent ja convida a tornar-hi.
            markAdded(event.id)
            if (!downloadIcs([toCalendarEvent(event)])) setFailed(true)
            else setGone(true)
          }}
          className="flex min-h-[48px] flex-1 items-center justify-center gap-[9px] rounded-cta border-0 bg-brand-cta px-6 font-body text-base font-bold text-on-brand [text-wrap:balance]"
        >
          <CalendarIcon size={19} className="flex-none" />
          {/* L'etiqueta curta: dins d'una fila de dos botons, «Afegeix-ho al
              calendari» en català es parteix en dues línies i el «No, gràcies»
              del costat queda estret. La fila permanent, que té l'ample
              sencer, sí que porta la llarga. */}
          <span>{t('event.calendar.addShort')}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            markDeclined(event.id)
            setGone(true)
          }}
          className="flex min-h-[48px] flex-none items-center justify-center bg-transparent px-6 font-body text-base font-bold text-fg-muted [text-wrap:balance]"
        >
          {t('event.calendar.noThanks')}
        </button>
      </div>

      {failed ? (
        <p role="alert" className="mt-4 text-md font-bold text-error [text-wrap:pretty]">
          {t('event.calendar.failed')}
        </p>
      ) : null}
    </div>
  )
}

/**
 * La fila permanent, just sota el bloc de fets.
 *
 * DUES CARES I CAP D'ELLES DIU «ÉS AL TEU CALENDARI» COM UN FET COMPROVAT.
 * L'app no pot llegir el calendari del telèfon —no hi ha cap API— o sigui que
 * el que se sap és que des d'aquest navegador es va baixar el fitxer. Per això
 * la cara d'«afegit» diu el que sap i porta «Torna-hi», que és inofensiu
 * perquè l'UID és el mateix i el calendari actualitza en comptes de duplicar.
 */
export function CalendarRow({ event }: { readonly event: EventRow }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const [added, setAdded] = useState(() => wasAdded(event.id))
  const [failed, setFailed] = useState(false)

  if (titleIsHidden(event.titulo)) return null

  const starts = new Date(event.starts_at)
  const when =
    event.ends_at === null
      ? `${formatDayMonth(starts, locale)}, ${formatTime(starts, locale)}`
      : t('event.calendar.fromTo', {
          day: formatDayMonth(starts, locale),
          from: formatTime(starts, locale),
          to: formatTime(new Date(event.ends_at), locale),
        })

  const go = () => {
    markAdded(event.id)
    if (downloadIcs([toCalendarEvent(event)])) {
      setAdded(true)
      setFailed(false)
    } else {
      setFailed(true)
    }
  }

  return (
    <section className={`pt-9 ${GUTTER}`}>
      {added ? (
        <div className="flex min-h-[56px] w-full items-center justify-between gap-6 border border-surface-8 bg-[var(--ds-bg-paid)] p-7">
          <span className="flex min-w-0 items-center gap-6">
            <span
              aria-hidden="true"
              className="grid size-[26px] flex-none place-items-center rounded-full bg-success text-sm font-extrabold text-app"
            >
              ✓
            </span>
            <span className="min-w-0">
              <span className="block text-base font-bold text-fg">
                {t('event.calendar.isThere')}
              </span>
              <span className="mt-[2px] block text-sm-lo text-fg-muted [text-wrap:pretty]">
                {when}
              </span>
            </span>
          </span>
          <button
            type="button"
            onClick={go}
            className="flex min-h-[44px] flex-none items-center px-2 font-body text-md font-bold text-fg-muted [text-wrap:balance]"
          >
            {t('event.calendar.again')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={go}
          className="flex min-h-[56px] w-full items-center justify-between gap-6 border border-surface-8 bg-surface-2 p-7 text-left font-body"
        >
          <span className="flex items-center gap-6">
            <CalendarIcon className="flex-none text-brand-accent" />
            <span className="text-base font-bold text-fg [text-wrap:balance]">
              {t('event.calendar.add')}
            </span>
          </span>
          <span aria-hidden="true" className="flex-none text-xl text-fg-muted">
            ›
          </span>
        </button>
      )}

      {/* Per què hi ha un «Torna-hi» en comptes d'un ✓ i prou. La frase és
          per a qui es pregunti si l'app s'ha equivocat. */}
      {added ? (
        <p className="mt-6 text-sm-lo leading-[1.4] text-fg-muted-lo [text-wrap:pretty]">
          {t('event.calendar.cannotRead')}
        </p>
      ) : null}

      {failed ? (
        <p role="alert" className="mt-4 text-md font-bold text-error [text-wrap:pretty]">
          {t('event.calendar.failed')}
        </p>
      ) : null}
    </section>
  )
}
