/**
 * Quan s'ha acabat una nit.
 *
 * AQUESTA REGLA JA EXISTIA TRES VEGADES, escrita a mà cada cop i idèntica les
 * tres: `EventScreen` per decidir si encara val la pena preguntar qui hi ha
 * dins, `InsideScreen` per apagar el punt de «ara mateix», i `useExitOffer`
 * per saber quan es pot demanar la foto de sortida. Les tres deien
 * `ends_at ?? starts_at + IN_PROGRESS_MS` i cap no ho deia en un lloc on la
 * quarta pantalla la pogués trobar. La quarta va arribar —«on ha estat» del
 * perfil d'un soci— i la va necessitar, que és el moment de fer-ne una de
 * sola en comptes d'una quarta còpia.
 *
 * LES SIS HORES no són una durada: són el que dura la ignorància. `ends_at` és
 * opcional a `events` i gairebé ningú no l'omple, així que quan no hi és cal
 * suposar-ne una. Sis hores és el que ja suposava l'Inici per no fer
 * desaparèixer del cartell la festa on ets dret.
 */

const HOUR_MS = 3_600_000

/**
 * Una activitat sense `ends_at` es dóna per acabada sis hores després de
 * començar.
 *
 * L'Inici ho fa servir per l'altra banda de la mateixa moneda: un esdeveniment
 * segueix sent «el que ve» mentre no hagi passat aquesta estona, perquè si no
 * la festa on ets desapareix de la pantalla a mitja festa.
 */
export const IN_PROGRESS_MS = 6 * HOUR_MS

/** L'instant en què la nit es va acabar, suposant-lo si cal. */
export function endOfEvent(startsAt: string, endsAt: string | null): number {
  return endsAt === null ? new Date(startsAt).getTime() + IN_PROGRESS_MS : new Date(endsAt).getTime()
}

/**
 * `>=` i no `>`: al mil·lisegon exacte del final ja s'ha acabat, que és el que
 * deia `EventScreen`, l'única de les tres còpies que es va parar a triar-ho.
 */
export function hasEnded(startsAt: string, endsAt: string | null, now: number): boolean {
  return now >= endOfEvent(startsAt, endsAt)
}
