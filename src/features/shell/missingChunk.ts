/**
 * Si un error és un tros de codi que no ha arribat.
 *
 * Fora de l'`ErrorBoundary` perquè ara el llegeixen dos llocs: la xarxa de sota
 * tota l'app i la de dins de la zona de junta, que sense cobertura no recarrega.
 *
 * Els tres navegadors ho diuen diferent i cap no dona un codi, així que és el
 * text o res. Si un dia canvia la frase, el cas cau al camí general: surt el
 * botó en comptes de recarregar sol, que és una degradació i no una caiguda.
 */
export function isMissingChunk(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message)
  )
}
