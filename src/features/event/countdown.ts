/**
 * Quant falta per saber què és.
 *
 * PER QUÈ NO ÉS `daysUntil`. Aquell arrodoneix a dies naturals en la zona de
 * l'associació, que és el que vol una fila de calendari —«d'aquí 34 dies»— i
 * exactament el que NO vol un compte enrere: a dues hores de la revelació
 * diria «0 dies» i el hero es quedaria sense res a dir. Això compta el temps
 * que falta de debò i tria la unitat segons què queda.
 *
 * TRES FORMES I NO UNA. Al hero de l'Inici hi cap una línia curta («6 d 4 h»);
 * a la pantalla de l'esdeveniment hi ha els tres blocs grans
 * (dies : hores : minuts); i a la fila de «Què més ve» hi cap una frase. Les
 * tres surten dels mateixos números, calculats aquí un sol cop, perquè si
 * cadascuna es fes els seus poden dir coses diferents al mateix segon.
 *
 * ELS NÚMEROS NO S'ARRODONEIXEN CAP AMUNT. Amb 90 minuts, «1 h» és cert i
 * «2 h» és mentida; qui obri l'app trenta minuts després veuria «1 h» i pensaria
 * que el rellotge no va. Es trunca sempre, que és com llegeix la gent un temps
 * que baixa.
 *
 * I EL PASSAT ÉS ZERO, no un número negatiu. Entre que la revelació passa i que
 * algú refresca hi ha una finestra on `reveal_at` ja ha passat però la pantalla
 * encara no ho sap; en aquella finestra el compte enrere ha d'estar a zero i no
 * comptant enrere cap a l'any passat.
 */

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

export interface Countdown {
  /** Ja ha passat: la pantalla ha de deixar de comptar. */
  readonly done: boolean
  readonly days: number
  readonly hours: number
  readonly minutes: number
  /** Total, per si una pantalla vol decidir amb un sol número. */
  readonly totalMs: number
}

export function countdown(target: string | Date, now: number = Date.now()): Countdown {
  const at = (target instanceof Date ? target : new Date(target)).getTime()
  const left = Math.max(0, at - now)

  return {
    done: left === 0,
    days: Math.floor(left / DAY_MS),
    hours: Math.floor((left % DAY_MS) / HOUR_MS),
    minutes: Math.floor((left % HOUR_MS) / MINUTE_MS),
    totalMs: left,
  }
}

/**
 * La unitat més gran que encara diu alguna cosa, per a la línia curta.
 *
 * Amb dies, els dies i les hores. Amb menys d'un dia, les hores i els minuts.
 * Amb menys d'una hora, només els minuts —perquè «0 h 12 m» fa pensar que
 * falta alguna cosa i «12 m» no.
 *
 * Torna les peces i no una cadena: les etiquetes són tres idiomes i van per
 * i18next, i una funció pura que retorna text traduït necessitaria el `t`.
 */
export type CountdownShape =
  | { readonly kind: 'days'; readonly days: number; readonly hours: number }
  | { readonly kind: 'hours'; readonly hours: number; readonly minutes: number }
  | { readonly kind: 'minutes'; readonly minutes: number }
  | { readonly kind: 'now' }

export function countdownShape(c: Countdown): CountdownShape {
  if (c.done) return { kind: 'now' }
  if (c.days > 0) return { kind: 'days', days: c.days, hours: c.hours }
  if (c.hours > 0) return { kind: 'hours', hours: c.hours, minutes: c.minutes }
  // Menys d'un minut segueix sent «1 m»: un zero que no és `done` es llegeix
  // com una pantalla encallada, i el que passa de debò és que falta un instant.
  return { kind: 'minutes', minutes: Math.max(1, c.minutes) }
}

/**
 * La línia curta, com a clau i variables: «Es sabrà d'aquí 6 d 4 h».
 *
 * Torna la clau i no el text perquè aquest fitxer no ha de saber res
 * d'i18next: amb el `t` com a paràmetre el tipus se'n contagia, i amb el text
 * ja traduït la funció deixaria de ser provable sense muntar l'idioma. Qui
 * crida fa `t(key, vars)`, que és una línia.
 *
 * `event.teaser.inDaysHours` i companyia són les tres formes; `count` no hi és
 * a posta —cap d'elles es pluralitza, i dir-li `count` faria que i18next
 * busqués `_one`/`_other` i no trobés res.
 */
export interface CountdownLabel {
  readonly key: string
  readonly vars: Record<string, number>
}

export function countdownLabel(shape: CountdownShape): CountdownLabel {
  switch (shape.kind) {
    case 'days':
      return {
        key: 'event.teaser.inDaysHours',
        vars: { days: shape.days, hours: shape.hours },
      }
    case 'hours':
      return {
        key: 'event.teaser.inHoursMinutes',
        vars: { hours: shape.hours, minutes: shape.minutes },
      }
    case 'minutes':
      return { key: 'event.teaser.inMinutes', vars: { minutes: shape.minutes } }
    case 'now':
      return { key: 'event.teaser.rightNow', vars: {} }
  }
}
