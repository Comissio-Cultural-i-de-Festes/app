import { useTranslation } from 'react-i18next'

import { formatDayMonth } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'

import type { PointRow } from './api'
import { LEDGER_ROW, puntsColor } from './ledger'

/**
 * Una línia del llibre major: quan, de què, per què i quants.
 *
 * ESTAVA ESCRITA DUES VEGADES, al perfil propi i al llibre major de la junta,
 * i les dues còpies ja havien començat a separar-se: una alineava al mig i
 * l'altra a dalt, una ensenyava el motiu sota el títol de la nit i l'altra no,
 * i la nota —que és la meitat que aquesta funció existeix per ensenyar— sortia
 * a la mida petita i apagada en una i a la mida normal a l'altra. Les dues
 * pinten la mateixa fila de la mateixa taula per a dues persones que parlaran
 * entre elles; dir-los-hi coses diferents és com comencen les converses de
 * «doncs a mi no em surt això».
 *
 * GUANYA LA VERSIÓ DE LA JUNTA en les tres diferències, i no per antiguitat:
 * alineat a dalt perquè la fila creix quan hi ha nota i un import centrat
 * contra tres línies de text queda flotant al mig; el motiu sota el títol
 * perquè «Castanyada» sol no diu si allò van ser punts de venir o de muntar; i
 * la nota a `text-fg-secondary` perquè una correcció que no es llegeix és
 * exactament el forat que l'issue #3 va obrir aquest camí per tapar.
 *
 * ÉS PRESENTACIÓ I NO ES BUSCA RES. Qui la pinta ja té les files —el perfil
 * per `profileScreenKeys.points(jo)`, la junta per la mateixa clau amb un
 * altre id— i afegir-hi una consulta aquí voldria dir una per fila.
 */

export function LedgerRow({ row }: { readonly row: PointRow }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)

  const titol = row.events?.event_title?.titulo ?? null

  return (
    <li className={LEDGER_ROW}>
      <p className="w-[52px] flex-none pt-[2px] text-sm-lo font-semibold text-fg-dim">
        {formatDayMonth(new Date(row.created_at), locale)}
      </p>

      <div className="min-w-0 flex-1">
        {/* El motiu quan no hi ha títol, i això inclou l'esdeveniment encara no
            revelat: la política deixa la fila fora i el nom arriba null. */}
        <p className="text-base [text-wrap:pretty]">{titol ?? t(`motive.${row.motivo}`)}</p>
        {titol === null ? null : (
          <p className="mt-[3px] text-sm-lo text-[var(--ds-text-muted-lo)]">
            {t(`motive.${row.motivo}`)}
          </p>
        )}
        {row.nota === null || row.nota === '' ? null : (
          <p className="mt-[5px] text-sm text-fg-secondary [text-wrap:pretty]">{row.nota}</p>
        )}
      </div>

      <p
        className={`tabular flex-none pt-[2px] text-base font-extrabold ${puntsColor(row.puntos)}`}
      >
        {row.puntos > 0 ? '+' : ''}
        {row.puntos}
      </p>
    </li>
  )
}
