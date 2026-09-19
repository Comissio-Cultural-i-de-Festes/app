import type { PointValue } from '@/features/junta/eventFormApi'

/**
 * Què val oferir un cotxe, per a les dues pantalles que ho diuen.
 *
 * `trajo_gente` i no `conduir`: des de la migració 71 el motiu és haver portat
 * algú, i el cotxe buit no val res. Les dues pantalles de cotxes ensenyen el
 * número —és on es decideix agafar el cotxe— i el text de sota diu la condició,
 * que els punts són per la gent que puges i no pel viatge.
 *
 * ESTÀ AQUÍ I NO DINS DE CADA PANTALLA perquè la clau era escrita dues vegades
 * i el dia que canviï ha de canviar un cop. Aquesta feina ve justament d'haver
 * trobat la mateixa clau copiada a tres llocs; deixar-ne dues còpies noves
 * mentre s'arregla això seria graciós.
 *
 * TORNA `null` I NO 0 QUAN NO HI HA FILA. Zero voldria dir «oferir un cotxe no
 * val res», que és una frase, i el que passa és que l'escala encara no ha
 * arribat o la consulta ha fallat. Les dues pantalles ho distingeixen: amb
 * `null` ensenyen la versió curta del text, sense número.
 */
export function rideReward(values: readonly PointValue[] | undefined): number | null {
  return values?.find((v) => v.mena === 'motiu' && v.clau === 'trajo_gente')?.punts ?? null
}
