import type { MemberNight } from './api'

/**
 * De la més recent a la més antiga, i amb un desempat.
 *
 * L'ordre el fa el client perquè són deu files —vegeu `fetchMemberNights`— i
 * això vol dir que l'empat s'ha de resoldre aquí. `Array.prototype.sort` és
 * estable des d'ES2019, però el que li arriba no ho és: PostgREST no promet
 * cap ordre sense `order`, així que dues activitats que comencen el mateix
 * minut podrien arribar capgirades entre dues peticions i la llista ballaria
 * sola a la pantalla. L'identificador desempata, com fa `private.streak_rows()`
 * a la base pel mateix motiu.
 *
 * Les dates arriben en ISO amb zona, o sigui que comparar-les com a text
 * ordena igual que comparar-les com a instants mentre totes acabin en `Z`,
 * que és el que torna PostgREST. `Date.parse` ho faria explícit i costaria una
 * conversió per comparació; això és el mateix que ja fa `InsideScreen`.
 */
export function sortNights(rows: readonly MemberNight[]): MemberNight[] {
  return [...rows].sort((a, b) => {
    const byDate = b.starts_at.localeCompare(a.starts_at)
    return byDate === 0 ? a.event_id.localeCompare(b.event_id) : byDate
  })
}
