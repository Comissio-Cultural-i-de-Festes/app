import { matchPath } from 'react-router'

/**
 * Les rutes de la porta: les pantalles de la zona de junta que s'han d'obrir
 * sense xarxa.
 *
 * Són les de `App.tsx` el mòdul de les quals és de la porta segons
 * `build/precache.ts`, que les posa a la precache. Aquí és on
 * `JuntaStrings.tsx` les deixa passar sense esperar els textos de la junta.
 * `build/doorRoutes.test.ts` llegeix les tres coses i falla si no casen, en
 * tots dos sentits:
 *
 *   - una pantalla de la porta que no fos aquí esperaria uns textos que no
 *     necessita, i sense xarxa diria que cal cobertura;
 *   - una d'escriptori que hi fos es pintaria abans que arribessin els seus, i
 *     ensenyaria claus crues fins i tot amb xarxa: react-i18next no torna a
 *     pintar quan s'hi afegeixen textos.
 *
 * En un fitxer propi i no dins de `JuntaStrings.tsx` perquè la prova la pugui
 * llegir sense muntar cap component.
 */
export const DOOR_ROUTES = [
  '/junta',
  '/junta/escaner/:eventId',
  '/junta/alta/:eventId',
  '/junta/punts/:eventId',
  '/junta/gimcana/:eventId',
] as const

export function isDoorPath(pathname: string): boolean {
  return DOOR_ROUTES.some((path) => matchPath(path, pathname) !== null)
}
