import { preloadJuntaStrings } from '@/i18n/junta'

/**
 * La porta, baixada abans d'arribar-hi.
 *
 * La porta NO depèn d'això. Els seus trossos són a la precache
 * (`build/precache.ts`), que s'instal·la sencera amb cada versió; el perquè hi
 * és explicat. El que aquí encara fa falta és el wasm del lector de QR: un
 * megabyte que no va a la precache, i que sense això es baixaria el primer cop
 * que s'obrís l'escàner, a la porta, on no hi ha cobertura. El wasm només canvia
 * quan canvia la biblioteca, o sigui que un cop baixat aguanta els desplegaments.
 *
 * Per això, en entrar a la zona de junta, que es fa a casa o pel camí, es demanen
 * el rebedor i el que s'obre des del seu bloc de la porta —l'escàner, l'alta a
 * mà, els punts i la cua de la gimcana—, i el lector de QR amb el seu wasm. Amb
 * el mateix especificador que fa servir `App.tsx`, o sigui els mateixos trossos
 * que el router demanarà després. Les pantalles ja hi serien; demanar-les no
 * costa res, i si un dia la regla de la precache se'n deixés alguna, aquí
 * quedaria a la memòria cau.
 *
 * També les quatre pantalles de feina a les quals porta el rebedor —pagaments,
 * socis, invitacions i fitxatges—, que no són a la precache. Amb el rebedor
 * obert a la porta i sense cobertura, «3 no pagats» és el primer que es toca;
 * així s'obre igualment si s'ha entrat a la zona amb xarxa des de l'últim
 * desplegament. Si no, ho diu `JuntaScreenBoundary` i no es perd res. I amb
 * elles els textos de la junta en l'idioma de la pantalla, que aquestes quatre
 * esperen abans de pintar (`src/i18n/junta.ts`): sense, s'obririen i es
 * quedarien esperant uns textos que no arribarien.
 *
 * Es va descartar baixar tota la zona: el formulari d'esdeveniment porta el mapa,
 * que és el tros més gros de tots, i la resta són pantalles d'escriptori que no
 * surten a la porta.
 *
 * NOMÉS AMB XARXA. Sense, no hi ha res a guanyar, i un `import()` que falla pot
 * quedar recordat com a fallat fins que es recarregui la pàgina. Una fallada no
 * diu res: és un avantatge, i amb cobertura la porta ho baixa sola.
 */
export function preloadDoor(): Promise<unknown> {
  if (!navigator.onLine) return Promise.resolve()
  return Promise.allSettled([
    import('@/features/junta/JuntaHome'),
    import('./ScannerScreen'),
    import('./ManualScreen'),
    import('./PointsScreen'),
    import('@/features/junta/GimcanaValidateScreen'),
    import('@/features/junta/PaymentsScreen'),
    import('@/features/junta/MembersScreen'),
    import('@/features/junta/InvitesScreen'),
    import('@/features/junta/CheckinsScreen'),
    import('./decoder').then((m) => m.warmDecoder()),
    preloadJuntaStrings(),
  ])
}
