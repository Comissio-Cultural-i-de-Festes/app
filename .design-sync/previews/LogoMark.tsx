import { LogoMark } from 'app-comi'

/**
 * The red square. The glyph inside is the association's short name from
 * configuration, not a literal — a trailing full stop is drawn as a disc
 * rather than set as a character, which is why "comi." works and "La Comi"
 * simply has no dot.
 */
export function Sizes() {
  return (
    <div className="flex items-end gap-8">
      <LogoMark size={28} />
      <LogoMark size={44} />
      <LogoMark size={64} />
      <LogoMark size={96} />
    </div>
  )
}

/** At app-icon size, which is the size it was drawn for. */
export function AppIcon() {
  return <LogoMark size={120} />
}

/** Next to a heading, which is its other job — a badge, not a signature. */
export function AsABadge() {
  return (
    <div className="flex items-center gap-5">
      <LogoMark size={36} />
      <div>
        <p className="text-2xs font-extrabold tracking-[0.1em] text-fg-dim uppercase">Junta</p>
        <p className="display text-d-s tracking-[-0.045em] text-fg">Portes</p>
      </div>
    </div>
  )
}
