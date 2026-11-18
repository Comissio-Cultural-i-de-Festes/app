import type { EventType } from '@/lib/model'

import { JUNTA_AHEAD_MS } from './eventsApi'

/**
 * Les eines d'una activitat, i quines li toquen.
 *
 * PER QUÈ PENGEN DE LA FITXA. L'escàner, l'alta pel nom, els punts i la cua de
 * la gimcana només sortien de la porta del rebedor, i la porta ensenyava un
 * esdeveniment durant unes hores. El servidor no hi posa cap finestra: per URL
 * tot funcionava, i era la pantalla qui ho amagava. Dues activitats el mateix
 * dia, una casa rural de tres dies o donar punts l'endemà del muntatge es
 * quedaven sense camí. Ara cada eina és de l'esdeveniment, i la porta és una
 * drecera cap a les del que passa ara.
 *
 * PER TIPUS. Una reunió no té porta: no té QR, ni preu, ni gimcana, i fitxar-hi
 * amb l'escàner donaria els punts que reparteix qui la tanca (o, en una de
 * junta, petaria contra `points_log_no_junta_meetings`). Només hi queda «qui ha
 * fitxat», que és on es veu qui ha dit que hi és. Festa, casa rural i activitat
 * tenen les mateixes: totes tenen porta.
 *
 * PER MOMENT:
 *
 *   · Abans: pagaments i la gimcana es preparen des que l'esdeveniment existeix;
 *     els punts també, perquè hi ha feina que es fa la setmana d'abans.
 *   · L'escàner i l'alta s'obren trenta hores abans, que és quan l'esdeveniment
 *     entra a la porta del rebedor. Fitxar algú tres setmanes abans d'una festa
 *     no és mai el que es volia, i amb la fila a la vista és un toc.
 *   · Després no es tanca res. L'endemà es fitxa qui es va quedar sense, es
 *     donen els punts del desmuntatge i es cobra qui va pagar en mà. Tancar-ho a
 *     una hora era exactament el defecte de l'issue.
 *
 * UN ESBORRANY NO TÉ PORTA. `check_in` contesta `event_not_open` a un
 * esdeveniment sense publicar, i ningú s'hi pot haver apuntat: les eines que
 * hi treballen sobre la gent no hi surten. La gimcana sí, perquè es prepara
 * abans de publicar.
 *
 * Pagaments, només si hi ha alguna cosa a fer-hi: preu, places —i per tant cua—
 * o cal confirmació. En una festa de franc oberta a tothom la pantalla seria
 * una llista de gent sense cap botó que tingui sentit.
 */

export type Eina =
  'escaner' | 'alta' | 'punts' | 'pagaments' | 'fitxatges' | 'gimcana' | 'validaGimcana'

export interface EinesDe {
  readonly tipo: EventType
  readonly starts_at: string
  readonly published: boolean
  readonly precio_cents: number
  readonly plazas: number | null
  readonly cal_confirmacio: boolean
  readonly teGimcana: boolean
}

/** Si l'escàner i l'alta ja tenen sentit: trenta hores abans, com la porta, i sense final. */
export function portaOberta(e: Pick<EinesDe, 'starts_at'>, now: number = Date.now()): boolean {
  return Date.parse(e.starts_at) <= now + JUNTA_AHEAD_MS
}

export function einesDe(e: EinesDe, now: number = Date.now()): readonly Eina[] {
  if (e.tipo === 'reunio') return ['fitxatges']

  const out: Eina[] = []
  if (e.published && portaOberta(e, now)) out.push('escaner', 'alta')
  if (e.published) out.push('punts')
  if (e.published && (e.precio_cents > 0 || e.plazas !== null || e.cal_confirmacio)) {
    out.push('pagaments')
  }
  out.push('fitxatges', 'gimcana')
  if (e.published && e.teGimcana) out.push('validaGimcana')
  return out
}

export function rutaDe(eina: Eina, eventId: string): string {
  switch (eina) {
    case 'escaner':
      return `/junta/escaner/${eventId}`
    case 'alta':
      return `/junta/alta/${eventId}`
    case 'punts':
      return `/junta/punts/${eventId}`
    case 'pagaments':
      return `/junta/pagaments/${eventId}`
    case 'fitxatges':
      return `/junta/esdeveniment/${eventId}/fitxatges`
    case 'gimcana':
      return `/junta/esdeveniment/${eventId}/gimcana`
    case 'validaGimcana':
      return `/junta/gimcana/${eventId}`
  }
}
