import type { CheckInStatus, ScanPresentation } from '@/design/states'

import type { CheckInResult } from './api'

/**
 * Les paraules que van a la targeta del veredicte.
 *
 * VIU FORA DEL COMPONENT perquè `Verdict` és una funció local dins
 * `ScannerScreen.tsx` i exportar-la només per provar-la trencaria la regla de
 * fast-refresh. I perquè és aquí on hi ha les decisions: què es diu quan
 * s'ha desfet un fitxatge, què es diu quan encara no ha arribat res, i què es
 * calla quan no hi ha res a pagar. El dibuix és una altra cosa.
 *
 * NO ES DIU «NO HA PAGAT» EN UNA ACTIVITAT DE FRANC. `attendances.pagado`
 * arrenca a `false` per a tothom, o sigui que sense el preu al davant tothom
 * qui passa per una porta gratuïta surt amb un deute sota el nom.
 *
 * I NOMÉS ES DIU QUAN SE SAP DEL CERT QUE HI HA PREU. `priceCents` val `null`
 * mentre la consulta de l'esdeveniment no ha tornat o ha fallat, i llavors la
 * línia calla. L'opció contrària —tractar el desconegut com «de pagament» per
 * no amagar mai un avís de debò— es va descartar: el que és accionable és la
 * capçalera d'estat, que ve del servidor i no depèn d'aquesta consulta, i
 * aquesta línia és informativa. Inventar-se un deute per si de cas és
 * exactament el que aquest fitxer arregla.
 */

export interface DetailPart {
  readonly key: string
  /** Sempre present, buit quan la frase no interpola res: `exactOptionalPropertyTypes`. */
  readonly params: Record<string, number>
}

export interface VerdictText {
  /** La frase gran sota el nom. */
  readonly headlineKey: string
  /** Què ha de fer qui té el telèfon, o null quan no hi ha res a fer. */
  readonly actionKey: string | null
  /** La línia de sota, en trossos, per unir amb « · ». */
  readonly detail: readonly DetailPart[]
}

/**
 * La còpia d'un estat quan l'activitat no costa res.
 *
 * Només `ok_walkin_review` en té: és l'estat de qui es presenta sense estar
 * apuntat en una activitat amb places comptades O amb preu, i quan és gratuïta
 * el que la fa saltar són les places. La frase de sempre parla de diners —«ni
 * ha pagat», «mira que pagui abans d'entrar»— i en aquest cas parla del que
 * toca, que és que el número de places quadri.
 */
const FREE_COPY: Partial<Record<CheckInStatus, Omit<VerdictText, 'detail'>>> = {
  ok_walkin_review: {
    headlineKey: 'scanner.okWalkinReviewFree',
    actionKey: 'scanner.action.okWalkinReviewFree',
  },
}

export function verdictText(
  shown: ScanPresentation,
  result: CheckInResult | null,
  opts: {
    /** El fitxatge s'ha desfet: la targeta ha de deixar de dir que és dins. */
    readonly gone: boolean
    /** La nota del desfer, quan n'hi ha. */
    readonly undoNote: string | null
    /** Cèntims de l'esdeveniment, o null mentre no se sàpiga. */
    readonly priceCents: number | null
  },
): VerdictText {
  // Zero és de franc; null és «encara no se sap», que no és el mateix.
  const override = opts.priceCents === 0 && result !== null ? FREE_COPY[result.status] : undefined
  const words = override ?? { headlineKey: shown.messageKey, actionKey: shown.actionKey }

  return {
    headlineKey: opts.gone && opts.undoNote !== null ? opts.undoNote : words.headlineKey,
    actionKey: opts.gone ? null : (opts.undoNote ?? words.actionKey),
    detail: result === null || opts.gone ? [] : detailOf(result, opts.priceCents),
  }
}

function detailOf(result: CheckInResult, priceCents: number | null): DetailPart[] {
  const parts: DetailPart[] = []

  if (result.points_awarded !== undefined && result.points_awarded > 0) {
    parts.push({ key: 'units.points', params: { count: result.points_awarded } })
  }
  if (priceCents !== null && priceCents > 0 && result.pagado === false) {
    parts.push({ key: 'door.notPaid', params: {} })
  }
  if (result.escola != null) {
    parts.push({ key: `escolaShort.${result.escola}`, params: {} })
  }

  return parts
}
