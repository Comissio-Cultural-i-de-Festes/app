import { useQuery } from '@tanstack/react-query'

import { doorKeys } from '@/features/door/api'
import { useCurs } from '@/features/ranking/useRanking'

import { fetchPointValues } from './eventFormApi'
import { type Llindars, type Pesos, llegeixNormativa } from './estatAvisos'

/**
 * La normativa dels avisos i la finestra del curs, que sempre van juntes.
 *
 * SUBSTITUEIX `useLlindar`, que llegia un sol número. Ara en són sis —tres pesos
 * i tres escalons, migració 84— i qui els interpreta és `estatDe()`; aquest
 * ganxo només diu d'on surten i quan són de debò.
 *
 * TRES PANTALLES DEMANEN EL MATEIX —la llista de socis, la fitxa i el rebedor de
 * `/junta`— i les tres han de dir el mateix estat de la mateixa persona. Amb les
 * consultes escrites tres vegades, n'hi hauria prou que una es deixés
 * `defaultPeriod` per tenir dos estats que no quadren i cap manera de saber quin
 * s'equivoca.
 *
 * LA FINESTRA ÉS LA DEL CURS I NO LA DEL TRIMESTRE, i qui la tria és `useCurs`,
 * que filtra per `mena = 'global'` com `private.periode_curs()`.
 *
 * `llest` ESPERA LES DUES COSES. Els períodes, per la truncació silenciosa de
 * `max_rows = 1000` que `fetchAvisComptes` evita fitant per `des_de`; i ara
 * també el barem, perquè abans d'arribar els sis números valen zero —apagats— i
 * la llista pintaria tothom «ok» un instant per canviar-ho tot just després. Un
 * xip que canvia de color sol és pitjor que un xip que tarda.
 *
 * LES DUES CONSULTES JA SÓN A LA CACHE gairebé sempre: els períodes els comparteix
 * amb el rànquing i el barem amb la porta. Aquest ganxo no n'afegeix cap de nova.
 */
export function useNormativa(): {
  readonly pesos: Pesos
  readonly llindars: Llindars
  readonly des_de: string | null
  readonly fins_a: string | null
  readonly llest: boolean
} {
  const values = useQuery({ queryKey: doorKeys.pointValues(), queryFn: fetchPointValues })
  const curs = useCurs()

  return {
    ...llegeixNormativa(values.data),
    des_de: curs.des_de,
    fins_a: curs.fins_a,
    llest: curs.llest && values.isSuccess,
  }
}
