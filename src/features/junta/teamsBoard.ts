import type { PersonRow } from '@/features/gimcana/api'

/**
 * La lògica de repartir la gent en equips, sense pantalla.
 *
 * EL GEST ÉS «TRIA EQUIP I TOCA NOMS». La junta sol arribar amb els grups
 * apuntats en un paper, equip per equip: triar l'equip una vegada i tocar-ne
 * els noms és un toc per persona. Un desplegable per fila n'eren tres, i amb
 * quaranta persones és la diferència entre un minut i cinc.
 *
 * TOCAR ALGÚ QUE JA ÉS A L'EQUIP ACTIU EL TREU. És el que fa una casella de
 * selecció, i la fila és dibuixada com una: si és marcada i la toques, es
 * desmarca. L'alternativa —que tocar-lo no fes res— deixava la junta sense
 * manera de treure ningú d'un equip.
 *
 * L'ORDRE ÉS ALFABÈTIC I NO CANVIA EN TOCAR. Ordenar per equip, o posar primer
 * qui no en té, faria saltar la fila de sota el dit just després de tocar-la, i
 * el toc següent cauria sobre una altra persona.
 */

/** Cap a on va algú quan la junta toca la seva fila. `null` és «sense equip». */
export function tapTarget(person: PersonRow, active: string): string | null {
  return person.equip_id === active ? null : active
}

/** La llista amb una persona canviada d'equip, sense tocar les altres. */
export function withTeam(
  people: readonly PersonRow[],
  userId: string,
  equipId: string | null,
): PersonRow[] {
  return people.map((p) => (p.user_id === userId ? { ...p, equip_id: equipId } : p))
}

/** Quanta gent hi ha a cada equip, i quanta sense equip (clau `null`). */
export function countByTeam(people: readonly PersonRow[]): Map<string | null, number> {
  const counts = new Map<string | null, number>()
  for (const p of people) counts.set(p.equip_id, (counts.get(p.equip_id) ?? 0) + 1)
  return counts
}

/**
 * Per buscar un nom: sense majúscules i sense accents.
 *
 * Amb el mòbil a la mà, «Joan» es busca com «joan» i «Martí» com «marti». Una
 * cerca que demanés l'accent exacte faria dir «no hi és» d'algú que hi és.
 */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('ca')
}

export function visiblePeople(
  people: readonly PersonRow[],
  query: string,
  onlyWithoutTeam: boolean,
): PersonRow[] {
  const q = fold(query.trim())
  return people.filter(
    (p) => (!onlyWithoutTeam || p.equip_id === null) && (q === '' || fold(p.nombre).includes(q)),
  )
}
