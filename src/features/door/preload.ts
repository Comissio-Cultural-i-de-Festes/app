/**
 * La porta, baixada abans d'arribar-hi.
 *
 * Les pantalles de la porta no són a la precache (`build/precache.ts`): les
 * guarda el service worker la primera vegada que es demanen, i a partir
 * d'aleshores s'obren sense xarxa. Si l'única manera de demanar-les fos obrir-les,
 * la primera vegada seria a la porta de la casa rural, que és justament on no
 * hi ha cobertura.
 *
 * Per això es demanen en entrar a la zona de junta, que es fa a casa o pel camí:
 * el rebedor i el que s'obre des del seu bloc de la porta —l'escàner, l'alta a
 * mà, els punts i la cua de la gimcana—, i el lector de QR amb el seu wasm. Amb
 * el mateix especificador que fa servir `App.tsx`, o sigui els mateixos trossos
 * que el router demanarà després.
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
