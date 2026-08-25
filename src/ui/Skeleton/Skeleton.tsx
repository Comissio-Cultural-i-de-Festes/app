/**
 * La silueta d'un bloc mentre encara no hi ha dades.
 *
 * Tres pantalles s'havien dibuixat cadascuna la seva —el rebedor de la junta,
 * les idees i els cotxes— amb la mateixa recepta escrita tres vegades:
 * `animate-pulse bg-surface-4`, `aria-hidden` a cada barra i `aria-busy` al
 * contenidor. La recepta és curta, i per això es tornava a escriure en lloc de
 * buscar-la; el problema no era la mida sinó que cada còpia podia derivar per
 * separat, i una barra sense `aria-hidden` la llegeix el lector de pantalla com
 * si fos contingut.
 *
 * Les mides van com a cadenes de classe (`w-[38px]`, `w-[70%]`) i no com a
 * números. Amb números caldria generar la classe a l'hora d'executar, i
 * Tailwind només veu el que hi ha escrit al codi: la classe no existiria.
 *
 * L'animació no es desactiva aquí. `prefers-reduced-motion` ja la mata a
 * `base.css` per a tota l'app, i repetir-ho seria una segona font de veritat.
 */

export function Skeleton({
  className = '',
  children,
}: {
  readonly className?: string
  readonly children: React.ReactNode
}) {
  return (
    <div aria-busy="true" className={className}>
      {children}
    </div>
  )
}

export function SkeletonBar({
  w,
  h,
  className = '',
}: {
  /** L'amplada, com a classe: `w-[38px]`, `w-[70%]`, `w-full`. */
  readonly w: string
  /** L'alçada, com a classe: `h-[13px]`. */
  readonly h: string
  readonly className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse bg-surface-4 ${w} ${h} ${className}`}
    />
  )
}
