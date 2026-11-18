/**
 * Què deixa veure i fer l'estat del perfil.
 *
 * La RLS no li dona a un pendent les assistències ni els punts dels altres, i
 * això no arriba al client com un error sinó com una llista buida. Pintar-la és
 * dir «hi van 0» quan són onze, «queden 30 places» quan en queden 25 i «cap
 * escola té punts» quan en tenen totes: tres mentides que no ho semblen. La
 * interfície no pot saber aquests números i per tant no els pinta; aquesta
 * funció és l'únic lloc on es decideix qui els veu.
 *
 * `known` existeix perquè el perfil arriba tard. Mentre no hi és, ningú no és
 * actiu: val més un instant sense recompte que un recompte fals que després
 * desapareix. `pending` és a part d'`active` perquè només a un pendent se li
 * pot dir que bescanviï un codi; qui és de baixa no.
 */

export interface Access {
  readonly known: boolean
  readonly active: boolean
  readonly pending: boolean
}

export function accessOf(profile: { readonly estat: string } | null | undefined): Access {
  if (profile == null) return { known: false, active: false, pending: false }
  return {
    known: true,
    active: profile.estat === 'actiu',
    pending: profile.estat === 'pendent',
  }
}
