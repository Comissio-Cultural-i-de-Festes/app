import type { QueryClient } from '@tanstack/react-query'

/**
 * Qui marxa s'ho emporta tot.
 *
 * Un mòbil de l'associació passa de mà en mà, i la memòria cau de consultes
 * viu mentre l'app és oberta: sense això, la persona següent trobaria el perfil,
 * les assistències i les fotos de porta de l'anterior fins que es refresquessin,
 * i les URL signades —una hora de vida— obririen les imatges sense haver de
 * tornar a demanar-les. És l'únic lloc que buida la cau a seques; la resta de
 * l'app no ho pot fer perquè tornaria a signar i baixar totes les imatges
 * (`tests/signed-url-keys.test.ts` ho vigila i fa aquí l'excepció).
 *
 * Es fa amb el canvi d'usuari de la sessió i no des del botó de tancar-la:
 * també es tanca sola quan caduca el refresc, o des d'una altra pestanya, i en
 * tots els casos qui entra després ha de trobar-ho net.
 *
 * Torna l'usuari que ara hi ha, perquè qui crida el recordi per a la propera.
 */
export function forgetOnUserChange(
  client: QueryClient,
  previous: string | null,
  current: string | null,
): string | null {
  if (previous !== null && previous !== current) client.clear()
  return current
}
