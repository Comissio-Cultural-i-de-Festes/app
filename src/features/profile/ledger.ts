/**
 * Com es pinta un import del llibre major.
 *
 * FORA DEL COMPONENT perquè la regla té una prova i el component no en pot
 * tenir sense muntar mig i18next, i perquè exportar-la des d'un `.tsx` amb un
 * component a dins trenca la regla del fast refresh.
 *
 * EL CAS QUE LA VA FER NÉIXER és el desglossament per motiu del perfil, que
 * escrivia `text-success` fix mentre la llista de sota i el llibre major de la
 * junta sí que canviaven de color. Amb `manual` —i ara amb `avis`— un motiu pot
 * quedar en negatiu, i «Avís · 1 vegada · −25» sortia en verd d'encert.
 */

/**
 * La forma d'una fila apilada: data a l'esquerra, cos al mig, xifra a la dreta.
 *
 * QUATRE LLOCS I NO DOS. Va néixer per al llibre major del perfil i el de la
 * junta; els avisos —la fitxa de la junta i la targeta del perfil— dibuixen
 * exactament la mateixa cosa i se l'havien escrita cadascun a la seva manera,
 * una amb `gap-4` i l'altra amb `gap-3`. Dotze píxels de diferència entre dues
 * llistes que surten a la mateixa pantalla, una sobre l'altra.
 *
 * NO ÉS LA FILA DE `ui/Row`. Aquella és la de navegar —centrada, amb xebró, i
 * porta a un altre lloc—; aquesta s'alinea a dalt perquè creix cap avall quan hi
 * ha una nota, i no porta enlloc.
 */
export const LEDGER_ROW = 'flex items-start gap-4 border-b border-surface-4 py-[15px]'

/**
 * Ambre quan resta, verd quan suma.
 *
 * AMBRE I NO VERMELL: el vermell és el to de l'associació i no pot voler dir
 * «malament» enlloc de l'app —`src/design/states.test.ts` ho vigila—, així que
 * el destructiu d'aquest repositori és `--ds-warning`.
 *
 * ZERO ES PINTA COM UNA SUMA. Una fila de zero punts no existeix: `award_points`
 * la refusa des de la migració 15. L'únic zero que es pot veure és un total per
 * motiu que s'ha compensat —un +20 i el seu −20—, i allò no és una pèrdua.
 */
export function puntsColor(punts: number): string {
  return punts < 0 ? 'text-[var(--ds-warning)]' : 'text-success'
}
