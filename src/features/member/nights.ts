import { hasEnded } from '@/lib/eventEnd'

import type { MemberNight } from './api'

/**
 * Només les que ja han passat, que és el que diu l'encapçalament.
 *
 * «ON HA ESTAT» llistava activitats del futur. El supòsit de qui va escriure la
 * consulta era que `asistio` només el posa la porta i que per tant una fila amb
 * aquell estat ja és passat; `public.close_meeting()` el trenca, perquè tanca
 * una acta i escriu `asistio` a tothom que hi consta sense mirar cap data.
 *
 * EL CRITERI NO ÉS NOU I NO N'HAVIA DE SER: és el mateix `@/lib/eventEnd` que
 * apaga el punt de «ara mateix» a `InsideScreen`. Aquesta pantalla és la
 * inversa d'aquella i amb el mateix tall encaixen sense solapament ni forat:
 * mentre la festa dura hi ETS, i quan s'acaba hi HAS ESTAT.
 *
 * L'OPCIÓ DESCARTADA era `starts_at < ara`, que és més curta i és la que surt
 * primera quan el que veus és una data del futur en una llista del passat.
 * Costa sis hores de contradicció: una festa que acaba de començar passaria a
 * ser «on ha estat» al mateix minut que `InsideScreen` diu que ets a dins, i
 * les dues pantalles es desmentirien tota la nit. Val més esperar que s'acabi:
 * el preu és que la festa d'aquesta nit no surt al teu perfil fins demà, i
 * això no ho mira ningú des de dins de la festa.
 */
export function pastNights(rows: readonly MemberNight[], now: number): MemberNight[] {
  return rows.filter((r) => hasEnded(r.starts_at, r.ends_at, now))
}

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
