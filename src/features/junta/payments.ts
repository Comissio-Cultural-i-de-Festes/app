/**
 * Què respon la pantalla de pagaments, per a aquest esdeveniment.
 *
 * UNA ACTIVITAT DE FRANC NO TÉ NINGÚ QUE NO HAGI PAGAT. No hi ha res a cobrar
 * i, per tant, no hi ha la pregunta: ni el títol, ni el número, ni l'avís del
 * Bizum diuen el mateix quan el preu és zero. La meitat verda dels diners ja
 * desapareixia sola des del primer dia —`formatPrice` torna `null` quan els
 * cèntims són zero— i el que quedava era la llista classificant la gent entre
 * pagats i pendents d'un import que no existeix.
 *
 * AIXÒ VIU FORA DEL COMPONENT perquè és la decisió, no el dibuix: quatre
 * cadenes que canvien alhora i un número que compta una cosa diferent segons el
 * cas. Dins la JSX serien quatre ternaris que ningú no pot provar sense muntar
 * la pantalla, i el dia que se n'hi afegís un cinquè no hi hauria res que
 * digués que se n'havien oblidat.
 *
 * El que NO decideix aquí: si es pot marcar algú. `attendances.pagado` i
 * `admin_set_paid` es queden tal com són —una activitat pot passar de gratuïta
 * a de pagament amb la gent ja apuntada— i el que canvia és qui ho ensenya.
 */

export interface PaidHeader {
  /** Si no hi ha res a cobrar. `precio_cents` és `not null default 0`. */
  readonly free: boolean
  readonly titleKey: string
  /** El número gran: qui ha pagat, o qui ve quan no hi ha res a pagar. */
  readonly n: number
  readonly subKey: string
  readonly subCount: number
  readonly noticeKey: string
}

export function paidHeader(
  priceCents: number,
  rows: readonly { readonly pagado: boolean }[],
): PaidHeader {
  if (priceCents > 0) {
    return {
      free: false,
      titleKey: 'junta.payments.whoPaid',
      n: rows.filter((r) => r.pagado).length,
      subKey: 'junta.payments.ofSignedUp',
      subCount: rows.length,
      noticeKey: 'junta.payments.bizum',
    }
  }

  return {
    free: true,
    titleKey: 'junta.payments.whoComes',
    n: rows.length,
    subKey: 'junta.payments.saidYes',
    subCount: rows.length,
    noticeKey: 'junta.payments.free',
  }
}
