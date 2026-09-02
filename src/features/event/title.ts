/**
 * Com es diu un esdeveniment quan encara no es pot dir.
 *
 * Des de la migració 44 el títol viu a `event_title` i la revelació el filtra,
 * o sigui que `EventRow.titulo` és `string | null` i el null vol dir una cosa
 * concreta: «encara no se sap». No és una dada que falti ni un error de
 * càrrega, i per això no es pinta en blanc.
 *
 * TRES INTERROGANTS I NO UN TEXT. «Per anunciar» o «Sense títol» es llegeixen
 * com una fitxa mal omplerta; «? ? ?» es llegeix com una cosa amagada a posta,
 * que és el que és. Amb els espais perquè a 38 px un `???` seguit sembla un
 * error de codificació.
 *
 * NO PASSA PER i18next. És puntuació, i és la mateixa als tres idiomes: una
 * clau per a «? ? ?» seria una cadena que ningú no pot traduir de cap manera
 * diferent i tres llocs on es pot desincronitzar. El que sí que va per
 * i18next és tot el que explica què vol dir.
 *
 * EL BUIT COMPTA COM A NULL. `admin_save_event` refusa un títol en blanc i la
 * taula té un CHECK, així que en teoria no pot arribar; però ve d'una vista amb
 * un left join i costa el mateix ser exacte que confiar-hi.
 */

export const HIDDEN_TITLE = '? ? ?'

export function eventTitle(titulo: string | null | undefined): string {
  return titulo === null || titulo === undefined || titulo.trim() === '' ? HIDDEN_TITLE : titulo
}

/**
 * Si el títol encara no es pot dir.
 *
 * Separat de `eventTitle` perquè hi ha pantalles que no volen el text sinó la
 * decisió: si posen el compte enrere o les places, si el hero va en violeta o
 * en vermell, si hi ha res a afegir al calendari.
 *
 * Mira l'entrada i no el resultat d'`eventTitle`, que seria més curt i estaria
 * malament: si algú de la junta bateja una festa «? ? ?», aquell esdeveniment
 * SÍ que està revelat i ha de sortir amb la portada i les places. El que
 * decideix és si hi ha títol, no quin.
 */
export function titleIsHidden(titulo: string | null | undefined): boolean {
  return titulo === null || titulo === undefined || titulo.trim() === ''
}
