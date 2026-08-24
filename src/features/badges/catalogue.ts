import {
  CasaMark,
  CopilotMark,
  DauMark,
  DiptricMark,
  IdeaMark,
  LlampMark,
  type Mark,
  MuntarMark,
  PortaMark,
  TresMark,
  VolantMark,
} from './marks'

/**
 * Les deu targetes, i per què no són dotze.
 *
 * La base guarda dotze codis perquè `cinc`, `deu` i `vint_i_cinc` són tres
 * insígnies de debò: cada una té la seva data i la seva activitat, i el full de
 * detall les ensenya totes tres amb el mes en què van caure. Però a la graella
 * són UNA targeta que puja de nivell — «no cal col·leccionar-ne tres» — perquè
 * tres caselles gairebé idèntiques enmig d'una graella de deu semblen un error.
 *
 * O sigui que la base no canvia i el que canvia és qui les agrupa, que és
 * aquest fitxer. `nivells` és el que fa la diferència entre les dues menes de
 * targeta, i no cal cap altra bandera.
 *
 * EL CATÀLEG NO ÉS UNA TAULA, i tampoc ho és a la base. La condició de cada
 * insígnia és SQL i el dibuix és TSX; tenir l'etiqueta en una tercera banda
 * seria garantir que algun dia diguin coses diferents. Els noms que es llegeixen
 * surten de les traduccions, com tot el text de l'app.
 */

/** Els codis tal com els guarda `public.badges`. */
export type BadgeCode =
  | 'primera'
  | 'cinc'
  | 'deu'
  | 'vint_i_cinc'
  | 'cap_de_setmana'
  | 'de_tot'
  | 'al_volant'
  | 'copilot'
  | 'a_muntar'
  | 'va_ser_idea_meva'
  | 'entrada_i_sortida'
  | 'de_les_primeres'

export interface BadgeCard {
  /** La clau de traducció, `badges.<key>.title` i `.hint`. */
  readonly key: string
  /** Un codi, o tres quan la targeta té nivells. En ordre de dificultat. */
  readonly codes: readonly BadgeCode[]
  readonly Mark: Mark
  /** Quantes activitats val cada nivell. Només la targeta de comptar en té. */
  readonly levels?: readonly number[]
}

/** L'ordre és el de la graella dibuixada, i és l'ordre en què es guanyen. */
export const CATALOGUE: readonly BadgeCard[] = [
  { key: 'primera', codes: ['primera'], Mark: PortaMark },
  {
    key: 'activitats',
    codes: ['cinc', 'deu', 'vint_i_cinc'],
    Mark: DauMark,
    levels: [5, 10, 25],
  },
  { key: 'capDeSetmana', codes: ['cap_de_setmana'], Mark: CasaMark },
  { key: 'deTot', codes: ['de_tot'], Mark: TresMark },
  { key: 'alVolant', codes: ['al_volant'], Mark: VolantMark },
  { key: 'aMuntar', codes: ['a_muntar'], Mark: MuntarMark },
  { key: 'copilot', codes: ['copilot'], Mark: CopilotMark },
  { key: 'vaSerIdeaMeva', codes: ['va_ser_idea_meva'], Mark: IdeaMark },
  { key: 'entradaISortida', codes: ['entrada_i_sortida'], Mark: DiptricMark },
  { key: 'deLesPrimeres', codes: ['de_les_primeres'], Mark: LlampMark },
]

export const TOTAL_CARDS = CATALOGUE.length

/**
 * Una targeta té insígnia si en té alguna de les seves.
 *
 * Amb nivells n'hi ha prou amb el primer: qui en porta deu ja ha passat pel
 * cinc, i la targeta és vermella des d'aleshores.
 */
export function isEarned(card: BadgeCard, earned: ReadonlySet<string>): boolean {
  return card.codes.some((c) => earned.has(c))
}

/** La targeta que conté un codi, per poder celebrar-ne una de nova. */
export function cardOf(code: string): BadgeCard | null {
  return CATALOGUE.find((c) => c.codes.some((x) => x === code)) ?? null
}
