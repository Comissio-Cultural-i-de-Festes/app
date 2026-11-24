import { zonedDayStart, zonedHour } from '@/i18n/format'

/**
 * Si el final d'un esdeveniment s'ha de dir amb el seu dia.
 *
 * «Dilluns 22:00 fins a les 18:00» és el que sortia d'una estada que acaba
 * dimecres: l'hora sola fa pensar que és el mateix dia. Es compara el dia de
 * calendari a la zona de l'associació i no el d'UTC ni el del telèfon, que és
 * el que fa tot el que és a `i18n/format`.
 *
 * LA NIT QUE PASSA DE MITJANIT NO ES DIU. La festa de les 23:00 a les 03:00
 * canvia de dia al calendari però és una sola nit, i «dissabte 23:00 fins a
 * diumenge, a les 03:00» fa pensar que dura un dia sencer. Es dóna per nit si
 * l'hora és abans de les sis del matí i no han passat dotze hores; en canvi
 * un final a les 10:00 de l'endemà es diu, encara que duri poc, perquè ningú
 * no el llegiria com a «aquesta mateixa nit». L'opció descartada era dir el dia
 * sempre que el calendari canviï: és la més simple i la que llegeix pitjor a
 * un esdeveniment nocturn, que és el cas habitual d'aquesta app.
 */
const NIGHT_ENDS_BEFORE_HOUR = 6
const NIGHT_MAX_MS = 12 * 3_600_000

export function endsOnOtherDay(starts: Date, ends: Date): boolean {
  if (zonedDayStart(ends) <= zonedDayStart(starts)) return false
  const sameNight =
    zonedHour(ends) < NIGHT_ENDS_BEFORE_HOUR && ends.getTime() - starts.getTime() < NIGHT_MAX_MS
  return !sameNight
}
