/**
 * Quan una data d'avís necessita el seu any.
 *
 * EL FORAT. `AvisosCard` data cada fila amb `formatDayMonth` —«4 de nov.»— i
 * la seva prosa ho justificava dient que la lectura està fitada al curs, o
 * sigui que dues files no poden portar mai el mateix dia i mes. No era
 * veritat. La finestra del curs surt de `ranking_periods`, i el `global` no té
 * mai data de final: `periodsFromChain` hi escriu `ends_at: null` a posta —la
 * pantalla dels períodes edita N+1 dates per a N trimestres i el curs segueix
 * la primera—. O sigui que la finestra és `[inici, ∞)` i no un curs: el
 * setembre que la junta no toqui les dates —que és el mateix setembre que la
 * targeta espera que ho torni tot a zero— hi caben dos novembres, i dos avisos
 * separats exactament un any es pinten igual.
 *
 * PER QUÈ NO ES FITA LA FINESTRA EN COMPTES D'AIXÒ. Era l'altra sortida:
 * donar-li un final al `global`, o derivar-ne un a `useCurs`. El preu és que
 * aquella finestra no és d'aquesta targeta. La comparteixen el rànquing, el
 * comptador d'avisos de `/junta/socis`, la capçalera de la fitxa i
 * `private.periode_curs()` dins d'`avisa()`, i han de dir tots el mateix. Un
 * final inventat al client els mouria tots cinc de cop, i el de la base no es
 * mouria gens: la mateixa persona sortiria amb dos comptadors diferents. La
 * data d'una fila és cosa de la fila.
 *
 * LA REGLA: UN ANY. Amb dia i mes sols, dues dates només es confonen si són el
 * mateix dia de dos anys diferents, i entre elles hi ha un any justos. Datant
 * amb l'any tot el que tingui un any o més, les dues cares del parell surten
 * sempre diferents —la jove amb dia i mes, la vella amb mes i any— i el cas
 * normal, que és un avís d'aquest curs, no perd el dia.
 *
 * DESCARTAT: «l'any diferent del d'avui». És més curt i també és correcte,
 * però un curs va de setembre a agost: al gener faria sortir amb l'any totes
 * les files d'octubre i novembre, que són les d'aquest mateix curs i les que
 * més es miren. Marcar el 60% de les files d'una llista és deixar de marcar.
 *
 * FORA DEL COMPONENT perquè es pugui provar sense muntar la targeta, i perquè
 * exportar-ho des d'un `.tsx` només per a la prova trenca la regla del fast
 * refresh.
 */

/**
 * `ara` no té valor per defecte a posta: una funció pura amb un rellotge de
 * sota és una funció que la prova no pot fixar sense tocar el rellotge global.
 */
export function volAny(quan: string, ara: Date): boolean {
  const faUnAny = new Date(ara.getTime())
  faUnAny.setFullYear(faUnAny.getFullYear() - 1)
  return new Date(quan).getTime() <= faUnAny.getTime()
}
