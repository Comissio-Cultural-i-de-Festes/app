/**
 * Quan toca escombrar l'storage, i com s'agrupa el que torna la base.
 *
 * La base diu què sobra (`my_storage_garbage`, migració 91) i l'app ho treu en
 * segon pla, perquè esborrar de Storage només es pot fer per l'API i cadascú
 * només pot treure el que les seves polítiques li deixen. Un cop al dia per
 * mòbil n'hi ha prou: el que es vol és que el bucket no creixi curs rere curs,
 * no que una foto marxi al minut, i a la casa rural cada petició de més és una
 * petició que competeix amb la de qui intenta enviar una prova.
 */

export const SWEEP_EVERY_MS = 24 * 60 * 60 * 1000

/** `last` és el que hi hagi a localStorage: res, un número, o brossa. */
export function sweepDue(last: string | null, now: number): boolean {
  if (last === null) return true
  const at = Number(last)
  // Una marca il·legible o del futur (un rellotge que s'ha mogut) no ha de
  // deixar el mòbil sense escombrar mai més.
  if (!Number.isFinite(at) || at > now) return true
  return now - at >= SWEEP_EVERY_MS
}

export interface Garbage {
  readonly bucket: string
  readonly path: string
}

/** Una crida d'esborrar per bucket, i no una per objecte. */
export function byBucket(rows: readonly Garbage[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const { bucket, path } of rows) {
    const list = out.get(bucket)
    if (list === undefined) out.set(bucket, [path])
    else list.push(path)
  }
  return out
}
