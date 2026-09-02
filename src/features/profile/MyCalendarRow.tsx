import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { downloadIcs, markAdded } from '@/features/event/icsStore'
import { CalendarIcon } from '@/features/event/icons'
import { titleIsHidden } from '@/features/event/title'
import { horizonIso } from '@/features/home/api'
import { unwrapAs } from '@/lib/db'
import type { CalendarEvent } from '@/lib/ics'
import type { EventRow } from '@/lib/schema'
import { supabase } from '@/lib/supabase'

/**
 * «Les meves al calendari»: tot el que has dit que sí, d'una tirada.
 *
 * BAIXA UN FITXER I NO OBRE UNA PANTALLA. El disseny hi dibuixa un xevró, que
 * normalment vol dir «aquí es va a algun lloc»; una pantalla que llista quatre
 * esdeveniments i té un sol botó a sota no afegeix res que la fila no pugui
 * dir. Un `.ics` amb quatre `VEVENT` és una sola descàrrega i el calendari els
 * posa tots.
 *
 * NOMÉS ELS QUE VÉNEN i només els sí. Un calendari ple de coses que ja han
 * passat no serveix de res, i «potser» no és una cita —posar-la al calendari
 * seria decidir per la persona.
 *
 * I ELS NO REVELATS NO HI SÓN: no tenen ni títol ni lloc. Es filtren aquí i no
 * a la consulta perquè és el mateix `titleIsHidden` que fa servir la resta de
 * la funció, i perquè el servidor ja no els dóna el títol de totes maneres.
 *
 * La fila no surt quan no hi ha res a baixar: un botó que baixa un fitxer buit
 * és pitjor que cap botó.
 */

const COLUMNS =
  'id, titulo, tipo, starts_at, teaser, reveal_at, revelat, plazas, precio_cents, ' +
  'puntos, published, cal_confirmacio, te_cotxes, descripcion, ubicacion, ends_at, cover_url, ' +
  'transport_info'

const myCalendarKeys = {
  mine: (horizon: string) => ['profile', 'calendar', horizon] as const,
}

/**
 * Els que vénen i a què has dit que sí.
 *
 * Dues peticions i no una amb un `join`: `attendances` no té clau forana cap a
 * `events_public` —és una vista— i incrustar-la per `events` tornaria a portar
 * el problema del títol. Els identificadors primer, la vista després.
 */
async function fetchMine(horizon: string): Promise<EventRow[]> {
  const rows = await unwrapAs<{ readonly event_id: string }[]>(
    supabase.from('attendances').select('event_id').in('estado', ['si', 'asistio']),
  )
  const ids = rows.map((r) => r.event_id)
  if (ids.length === 0) return []

  return unwrapAs<EventRow[]>(
    supabase
      .from('events_public')
      .select(COLUMNS)
      .in('id', ids)
      .eq('published', true)
      .gte('starts_at', horizon)
      .order('starts_at'),
  )
}

export function MyCalendarRow({ className = '' }: { readonly className?: string }) {
  const { t } = useTranslation()
  const horizon = horizonIso()
  const [failed, setFailed] = useState(false)

  const mine = useQuery({
    queryKey: myCalendarKeys.mine(horizon),
    queryFn: () => fetchMine(horizon),
  })

  const events = (mine.data ?? []).filter((e) => !titleIsHidden(e.titulo))
  // Cap esquelet: és una fila d'ajustos entre altres files d'ajustos, i una
  // silueta que apareix i desapareix hi faria un salt per una cosa que
  // normalment no hi és.
  if (mine.isPending || events.length === 0) return null

  const calendar: CalendarEvent[] = events.map((e) => ({
    id: e.id,
    titol: e.titulo ?? '',
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    ubicacio: e.ubicacion,
    descripcio: e.descripcion,
  }))

  return (
    <>
      <button
        type="button"
        onClick={() => {
          for (const e of events) markAdded(e.id)
          setFailed(!downloadIcs(calendar, 'les-meves.ics'))
        }}
        className={`flex w-full items-center gap-3 border-b border-surface-4 py-[15px] text-left ${className}`}
      >
        <CalendarIcon size={19} className="flex-none text-brand-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-fg">
            {t('profile.settings.calendar')}
          </span>
          <span className="mt-[3px] block text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
            {t('profile.settings.calendarSub', { count: events.length })}
          </span>
        </span>
        <span aria-hidden="true" className="flex-none text-2xl text-brand-accent">
          ›
        </span>
      </button>

      {failed ? (
        <p role="alert" className="pt-4 text-md font-bold text-error [text-wrap:pretty]">
          {t('event.calendar.failed')}
        </p>
      ) : null}
    </>
  )
}
