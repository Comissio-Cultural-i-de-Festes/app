import { useQuery } from '@tanstack/react-query'

import { doorKeys } from '@/features/door/api'
import { cursPeriod, fetchPeriods, periodBounds, rankingKeys } from '@/features/ranking/api'

import { SENSE_LLINDAR } from './avisosCompte'
import { fetchPointValues } from './eventFormApi'

/**
 * El llindar de gravetat i la finestra del curs, que sempre van juntes.
 *
 * DUES PANTALLES DEMANEN EL MATEIX PARELL —la llista de socis i el rebedor de
 * `/junta`— i les dues han de respondre el mateix. Amb les dues consultes
 * escrites dues vegades, n'hi hauria prou que una es deixés `defaultPeriod` per
 * tenir dos comptadors que no quadren i cap manera de saber quin s'equivoca.
 *
 * LA FINESTRA ÉS LA DEL CURS I NO LA DEL TRIMESTRE, i qui la tria és
 * `cursPeriod` i no `defaultPeriod`. La primera versió d'aquest fitxer deia que
 * eren la mateixa cosa, i era fals: `defaultPeriod` és la primera fila per
 * `ordre` sense mirar la `mena` —una preferència de pantalla— mentre que
 * `private.periode_curs()`, que és qui decideix el sostre dins d'`avisa()`, fa
 * `where mena = 'global' order by ordre, codi limit 1`. Coincidien només perquè
 * la fila sembrada `curs` és global i té `ordre` 0, i `admin_save_periods` no
 * exigeix ni que n'hi hagi cap de global ni que vagi primera. `cursPeriod` fa
 * la frase de la base, i llavors les dues bandes compten el mateix curs per
 * construcció i no per com estan sembrades les quatre files d'avui.
 *
 * LES DUES CONSULTES JA SÓN A LA CACHE gairebé sempre: els períodes els comparteix
 * amb el rànquing i els valors amb la porta. Aquest ganxo no n'afegeix cap de
 * nova, només diu quines dues són.
 *
 * ZERO VOL DIR SENSE LLINDAR, com el sostre a `avisa()`. És la sortida que la
 * junta té per apagar la marca sense haver de tocar cap esquema, i per això no
 * es substitueix per cap valor per defecte quan la fila no hi és: si algú
 * l'esborra, el que ha de passar és que la marca desaparegui, no que n'aparegui
 * una d'inventada.
 *
 * `llest` HI ÉS PER UNA TRUNCACIÓ SILENCIOSA. `supabase/config.toml` posa
 * `max_rows = 1000` a PostgREST: una lectura d'`avisos` sense fitar es queda a
 * mil files SENSE ERROR, i el comptador diria un número més petit del que toca
 * sense que res ho digués. Qui llegeix els avisos els fita per `des_de`, i per
 * fitar-los cal esperar que els períodes hagin arribat —abans, `des_de` és null
 * i «sense finestra» és indistingible de «encara no ho sé»—. Amb `llest` la
 * consulta no surt fins que la resposta és de debò.
 */
export function useLlindar(): {
  readonly llindar: number
  readonly des_de: string | null
  readonly fins_a: string | null
  readonly llest: boolean
} {
  const values = useQuery({ queryKey: doorKeys.pointValues(), queryFn: fetchPointValues })
  const periods = useQuery({ queryKey: rankingKeys.periods(), queryFn: fetchPeriods })

  const fila = values.data?.find((v) => v.mena === 'avisos' && v.clau === 'llindar')
  const bounds = periodBounds(cursPeriod(periods.data))

  return {
    llindar: fila?.punts ?? SENSE_LLINDAR,
    des_de: bounds.from,
    fins_a: bounds.to,
    llest: periods.isSuccess,
  }
}
