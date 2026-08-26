/**
 * L'avís amb el filet de color a l'esquerra.
 *
 * Cinc pantalles el tenien escrit a mà amb la mateixa cadena de classes: el
 * perfil pendent d'aprovar a l'Inici, la sessió que s'ha quedat al navegador a
 * l'entrada, la posició a la llista d'espera d'un esdeveniment, la prova de
 * gimcana desada sense cobertura i les dues notes del bloc de fitxatge. Cinc
 * còpies volen dir cinc coses que poden derivar per separat, i tres ja havien
 * derivat: una no portava `role="status"` i una altra no tenia color de text.
 *
 * L'ambre és perill i el vermell és marca —mai un estat— i per això el to de
 * l'avís no arriba mai a `--ds-brand`. El verd és per a «fet», que és l'altra
 * meitat del bloc de fitxatge.
 *
 * El neutre va arribar més tard, i la prova que faltava és que `EventScreen` i
 * `SubmitScreen` feien servir aquest component en un lloc i escrivien el neutre
 * a mà vint línies més avall: no era mandra, era un to que no hi era.
 *
 * NO ÉS PER A UNA LÍNIA DE TEXT. La junta té quatre confirmacions que són text
 * de color i prou —«Fet: 3 persones», «Desat»— amb `role="status"` escrit a mà.
 * Passar-les per aquí els posaria una caixa que no demanaven. Això és l'avís
 * amb filet; una línia que confirma no ho és.
 *
 * El marge queda fora: cada pantalla el vol diferent (el de l'Inici va a sang
 * amb el gutter propi, el de l'entrada respira 26 px) i posar-lo aquí seria
 * decidir per elles. El `padding` sí que és aquí, en dues mides, perquè és el
 * que fa que l'avís es reconegui d'una pantalla a l'altra.
 */

const TONES = {
  ok: { box: 'border-success bg-surface-2 ', text: 'text-fg ' },
  warn: { box: 'border-warning bg-surface-1 ', text: 'text-fg-secondary ' },
  neutral: { box: 'border-surface-7 bg-surface-1 ', text: 'text-fg-secondary ' },
} as const

export function Notice({
  tone = 'warn',
  size = 'default',
  as: As = 'p',
  live = false,
  className = '',
  children,
}: {
  readonly tone?: keyof typeof TONES
  /** `tight` per als avisos que ja viuen dins d'un bloc amb coixí propi. */
  readonly size?: 'default' | 'tight'
  /**
   * Un paràgraf, o una caixa amb coses a dins.
   *
   * I la diferència no és només l'etiqueta: **un avís que és un paràgraf porta
   * la seva pròpia tipografia; un que és una caixa la deixa als seus fills**,
   * que ja la porten. Posar-hi `text-md` i un color a la caixa canviaria el que
   * hereten un títol i un cos que ja s'havien decidit.
   *
   * `span` hi és perquè un dels avisos viu dins d'una cadena de `<span>` i un
   * `<div>` allà seria HTML invàlid.
   */
  readonly as?: 'p' | 'div' | 'span'
  /**
   * Si apareix mentre algú mira la pantalla, i per tant s'ha d'anunciar.
   *
   * Per defecte no. `role="status"` de sèrie volia dir que a l'Inici hi
   * podien coincidir quatre regions live i que obrir l'app eren tres anuncis
   * seguits abans de saber quin esdeveniment ve. El que ja hi és en carregar
   * no s'ha d'anunciar: només s'ha de poder llegir en ordre.
   *
   * El criteri és «entra sol o ja hi era», no «és important o no». L'avís d'un
   * fitxatge refusat és el cas que ho aclareix: no és el més greu de la
   * pantalla, però és l'únic que apareix mentre algú mira —el drenatge de la
   * cua li porta el veredicte— i per això sí que en porta.
   */
  readonly live?: boolean
  /** Només per al marge i la posició. */
  readonly className?: string
  readonly children: React.ReactNode
}) {
  const paragraph = As === 'p'

  return (
    <As
      {...(live ? { role: 'status' as const } : {})}
      className={
        'border-l-[3px] ' +
        (size === 'tight' ? 'px-7 py-6 ' : 'px-[18px] py-[15px] ') +
        TONES[tone].box +
        (paragraph ? `text-md [text-wrap:pretty] ${TONES[tone].text}` : '') +
        (As === 'span' ? 'block ' : '') +
        className
      }
    >
      {children}
    </As>
  )
}
