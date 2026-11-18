import { AVATARS } from '@/lib/storage'
import { useSignedUrls } from '@/lib/useSignedUrls'

/**
 * Una URL signada per a un avatar, sense una petició per cara.
 *
 * PER QUÈ NO ÉS UN `useCovers` A CADA PANTALLA. Els avatars surten a vint-i-cinc
 * llocs de dinou fitxers: el rànquing, les cares de qui va a una festa,
 * l'escàner, els socis, els pagaments, els cotxes. Fer que cada pantalla
 * reculli els camins i els signi en bloc voldria tocar-los tots i deixar-ne un
 * mig fet el dia que algú afegeixi una llista nova. Aquí el component ho resol
 * ell, i les crides es junten a sota: `useSignedUrls` fa una entrada per camí i
 * una sola petició per a tot el que es demana en el mateix microtask. Trenta
 * cares a la pantalla del rànquing són una petició, no trenta.
 *
 * I LA MAJORIA NO EN DEMANEN CAP. `avatar_url` guarda una URL absoluta de
 * Google per a tothom que no s'hagi canviat la foto, i aquelles passen tal com
 * són. Això vol dir que aquest fitxer no signa res fins que algú puja una foto,
 * que és exactament el que ha de passar.
 */
export function useAvatarUrl(src: string | null): string | null {
  const { data } = useSignedUrls(AVATARS, [src])
  return src === null ? null : (data.get(src) ?? null)
}
