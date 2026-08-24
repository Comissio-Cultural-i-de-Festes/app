import type { TFunction } from 'i18next'

import type { Escola } from '@/lib/model'

/**
 * Com es diu un equip.
 *
 * Dues procedències i una sola resposta. En mode escoles la fila no porta nom
 * —el nom d'una escola ja viu a les traduccions, i desar-lo tres vegades a la
 * base seria tenir-lo en dos llocs— i en els altres tres modes el nom és el que
 * hi va posar la junta o el número que li va tocar al sorteig.
 */
export function teamName(
  team: { readonly nom?: string | null; readonly escola: string | null },
  index: number,
  t: TFunction,
): string {
  // `escolaShort` i no `escolaOf`: aquest és el nom de l'equip i no
  // un complement d'una frase. «Jugues amb de la Politècnica» és el que surt si
  // s'agafa la forma genitiva.
  if (team.escola !== null) return t(`escolaShort.${team.escola as Escola}`)
  if (team.nom != null && team.nom !== '') return team.nom
  return t('gimcana.teamNumber', { n: index + 1 })
}
