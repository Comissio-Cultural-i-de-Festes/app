/**
 * La franja opaca que tapa la barra d'estat.
 *
 * PER QUÈ FA FALTA. `index.html` demana `viewport-fit=cover`, que és el que fa
 * que `env(safe-area-inset-*)` valgui alguna cosa, i el preu és que la vista
 * s'estén per sota de la barra d'estat. En repòs no es nota: cada pantalla ja
 * es paga el coixí de dalt. En fer scroll sí: el contingut puja i passa per
 * darrere del rellotge, la cobertura i la bateria, i el títol es barreja amb
 * ells fins a no poder-se llegir.
 *
 * L'Inici i el Rànquing no ho van patir mai per casualitat: tenen la capçalera
 * `sticky` amb `bg-app`, i aquella barra enganxada tapa la franja tota
 * l'estona. Les pantalles amb una capçalera que se'n va cap amunt —Idees,
 * Perfil— no tenien res allà, i el problema només es veu amb un iPhone a la mà
 * i fent scroll. Va sortir així.
 *
 * PER QUÈ UNA PEÇA I NO DUES LÍNIES REPETIDES. `tests/safe-area.test.ts` ja
 * explica què passa quan una regla d'aquestes viu com a convenció en dinou
 * llocs: dura fins que algú escriu la pantalla vint. El mateix val aquí, i el
 * motiu s'ha d'escriure un sol cop i no dos.
 *
 * `--ds-safe-top-min` i no el valor cru: porta el terra de dotze píxels que el
 * test exigeix, i sense osca la franja és una mica de coixí del mateix color
 * que la pàgina, o sigui que no es veu.
 *
 * S'enganxa a `--ds-sticky-top` i no a zero perquè la banda de pendent pot
 * estar ocupant el capdamunt: és el mateix punt on s'enganxen les capçaleres
 * de l'Inici i del Rànquing, i així les tres coincideixen.
 */
export function SafeTop() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-[var(--ds-sticky-top)] z-20 h-[var(--ds-safe-top-min)] bg-app"
    />
  )
}
