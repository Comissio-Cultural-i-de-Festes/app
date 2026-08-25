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
 * meitat del bloc de fitxatge i el motiu que aquí hi hagi dos tons i no un.
 *
 * El marge queda fora: cada pantalla el vol diferent (el de l'Inici va a sang
 * amb el gutter propi, el de l'entrada respira 26 px) i posar-lo aquí seria
 * decidir per elles. El `padding` sí que és aquí, en dues mides, perquè és el
 * que fa que l'avís es reconegui d'una pantalla a l'altra.
 */

export function Notice({
  tone = 'warn',
  size = 'default',
  live = false,
  className = '',
  children,
}: {
  readonly tone?: 'ok' | 'warn'
  /** `tight` per als avisos que ja viuen dins d'un bloc amb coixí propi. */
  readonly size?: 'default' | 'tight'
  /**
   * Si apareix mentre algú mira la pantalla, i per tant s'ha d'anunciar.
   *
   * Per defecte no. `role="status"` de sèrie volia dir que a l'Inici hi
   * podien coincidir quatre regions live i que obrir l'app eren tres anuncis
   * seguits abans de saber quin esdeveniment ve. El que ja hi és en carregar
   * no s'ha d'anunciar: només s'ha de poder llegir en ordre.
   */
  readonly live?: boolean
  /** Només per al marge i la posició. */
  readonly className?: string
  readonly children: React.ReactNode
}) {
  return (
    <p
      {...(live ? { role: 'status' as const } : {})}
      className={
        'border-l-[3px] text-md [text-wrap:pretty] ' +
        (size === 'tight' ? 'px-7 py-6 ' : 'px-[18px] py-[15px] ') +
        (tone === 'ok'
          ? 'border-success bg-surface-2 text-fg '
          : 'border-warning bg-surface-1 text-fg-secondary ') +
        className
      }
    >
      {children}
    </p>
  )
}
