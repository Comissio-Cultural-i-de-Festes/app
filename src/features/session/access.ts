/**
 * Què deixa veure i fer l'estat del perfil.
 *
 * La RLS no li dona a un pendent les assistències ni els punts dels altres, i
 * això no arriba al client com un error sinó com una llista buida. Pintar-la és
 * dir «hi van 0» quan són onze, «queden 30 places» quan en queden 25 i «cap
 * escola té punts» quan en tenen totes: tres mentides que no ho semblen. La
 * interfície no pot saber aquests números i per tant no els pinta.
 *
 * `closed` és el que les pantalles consulten, i és «el perfil DIU que no és
 * actiu», no «no consta que ho sigui». Un perfil que encara no ha arribat o que
 * ha fallat —amb mala cobertura passa— no tanca res: amagar els botons a un
 * soci actiu per una petició caiguda és pitjor que un recompte un instant de
 * més, que a més el servidor ja corregeix. `active` es queda per a qui
 * necessita la resposta afirmativa. `pending` és a part perquè només a un
 * pendent se li pot dir que bescanviï un codi; qui és de baixa no.
 */

export interface Access {
  readonly known: boolean
  readonly active: boolean
  readonly pending: boolean
  readonly closed: boolean
}

export function accessOf(profile: { readonly estat: string } | null | undefined): Access {
  if (profile == null) return { known: false, active: false, pending: false, closed: false }
  const active = profile.estat === 'actiu'
  return { known: true, active, pending: profile.estat === 'pendent', closed: !active }
}
