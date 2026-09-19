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
 *
 * I LA REGLA VAL TAMBÉ PER A LA CAPÇALERA, que és on no valia. El `null` es
 * quedava la còpia de diners —«ni ha pagat», «mira que pagui abans d'entrar»—
 * perquè la tria només mirava `priceCents === 0`: dins del mateix fitxer, la
 * línia de detall callava i la frase de sobre acusava. Amb la xarxa lenta a una
 * activitat de franc, això és el deute inventat per una altra porta.
 *
 * PERÒ CALLAR NO ÉS LA RESPOSTA A NO SABER-HO. El primer intent d'això va
 * deixar el desconegut amb la frase de la gratuïta, i llavors una porta DE
 * PAGAMENT amb la consulta de l'esdeveniment caiguda deixava de dir que s'ha
 * de cobrar: es va tapar el fals positiu obrint el fals negatiu. El que se sap
 * quan no se sap el preu és precisament que no se sap, i això és el que diu la
 * frase pròpia del cas: no acusa ningú de deure res i tampoc no deixa passar
 * un cobrament sense avisar, perquè demana mirar-ho.
 *
 * Aquestes paraules també són les de l'alta pel nom: `ManualScreen` les
 * demana amb `statusWords`. Abans llegia `presentationOf(outcome).messageKey`
 * tal qual i per això la pantalla del costat de l'escàner encara acusava d'un
 * deute inexistent a una activitat de franc.
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

/** Què se sap del preu, que són tres coses i no dues. */
type PriceCase = 'paid' | 'free' | 'unknown'

function priceCase(priceCents: number | null): PriceCase {
  if (priceCents === null) return 'unknown'
  return priceCents > 0 ? 'paid' : 'free'
}

/**
 * La còpia d'un estat segons el que se sap del preu.
 *
 * Només `ok_walkin_review` en té: és l'estat de qui es presenta sense estar
 * apuntat en una activitat amb places comptades O amb preu, i quan és gratuïta
 * el que la fa saltar són les places. La frase de sempre parla de diners —«ni
 * ha pagat», «mira que pagui abans d'entrar»— i quan és de franc parla del que
 * toca, que és que el número de places quadri.
 *
 * AMB EL PREU DESCONEGUT NO ES DIU CAP DE LES DUES, SINÓ UNA TERCERA. Les dues
 * de sempre afirmen un fet de l'esdeveniment que aquí no consta: l'una que hi
 * ha un import per cobrar, l'altra que el que està comptat són les places. La
 * del desconegut només afirma el que ve del servidor —aquesta persona no
 * estava apuntada— i afegeix la feina que queda, que és mirar si allò es paga.
 *
 * LES DUES MEITATS HAN DE SER CERTES ALHORA. Prestar-li la frase de la
 * gratuïta —que és el que es va fer primer— tapava el fals positiu (dir «ni ha
 * pagat» on no hi ha res a pagar) obrint-ne el fals negatiu: a una porta DE
 * PAGAMENT amb la consulta de l'esdeveniment caiguda, la targeta deixava de
 * dir que s'ha de cobrar i ningú no ho sabia fins a dilluns. Una pregunta no
 * és una acusació: «mira si l'activitat es paga» és certa a les dues portes, i
 * cap de les altres dues no ho és.
 *
 * L'altra opció descartada era quedar-se la còpia de diners mentre no se sabés
 * el preu, per no amagar mai un cobrament de debò. Costava el mateix que
 * arregla la línia de detall: a una activitat gratuïta amb la consulta en vol,
 * algú que no estava apuntat sortia amb un deute sota el nom que ningú no pot
 * respondre.
 */
const WALKIN_REVIEW_COPY: Record<PriceCase, Omit<VerdictText, 'detail'>> = {
  paid: {
    headlineKey: 'scanner.okWalkinReview',
    actionKey: 'scanner.action.okWalkinReview',
  },
  free: {
    headlineKey: 'scanner.okWalkinReviewFree',
    actionKey: 'scanner.action.okWalkinReviewFree',
  },
  unknown: {
    headlineKey: 'scanner.okWalkinReviewUnknown',
    actionKey: 'scanner.action.okWalkinReviewUnknown',
  },
}

const PRICED_COPY: Partial<Record<CheckInStatus, Record<PriceCase, Omit<VerdictText, 'detail'>>>> =
  {
    ok_walkin_review: WALKIN_REVIEW_COPY,
  }

/**
 * Quina frase i quina acció van amb aquest estat, sabent el que se sap del preu.
 *
 * Exportada perquè hi ha dues portes i no una. `ScannerScreen` hi arriba per
 * `verdictText`, que hi afegeix el desfer i la línia de detall; `ManualScreen`
 * no té ni l'una ni l'altra —la tira de l'últim fitxat porta el seu propi
 * desfer i la fila de la llista només té lloc per a tres paraules— i el que
 * necessita és exactament això. Que la tria visqui en un sol lloc és el que
 * evita que la meitat de les portes quedi arreglada, que és el que va passar.
 *
 * LA TRIA VA PER `result.status` I NO PER `shown`. Un escaneig encuat es
 * dibuixa amb la presentació d'`ok_walkin_review` manllevada, o sigui que
 * mirar-se `shown` acabaria triant la còpia d'un estat que el servidor no ha
 * dit mai. Sense `result` no hi ha estat i no hi ha res a substituir.
 */
export function statusWords(
  shown: ScanPresentation,
  result: CheckInResult | null,
  priceCents: number | null,
): Omit<VerdictText, 'detail'> {
  const override = result === null ? undefined : PRICED_COPY[result.status]?.[priceCase(priceCents)]
  return override ?? { headlineKey: shown.messageKey, actionKey: shown.actionKey }
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
  const words = statusWords(shown, result, opts.priceCents)

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
