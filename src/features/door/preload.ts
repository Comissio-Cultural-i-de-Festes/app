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
 * Es va descartar baixar tota la zona: el formulari d'esdeveniment porta el mapa,
 * que és el tros més gros de tots, i la resta són pantalles d'escriptori, que es
 * fan servir amb xarxa.
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
    import('./decoder').then((m) => m.warmDecoder()),
  ])
}
