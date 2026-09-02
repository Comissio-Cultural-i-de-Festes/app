/**
 * Les dues icones del full de la foto.
 *
 * Mateix traç que les de la barra de pestanyes i que les insígnies: viewBox de
 * 24, `currentColor`, `<rect rx>` i `<circle>`, i cap detall fi. A 19 píxels
 * sobre un fons fosc, un objectiu de càmera amb reflex és una taca.
 *
 * `aria-hidden` sempre: totes dues van dins d'un botó que ja diu què fa.
 */

interface IconProps {
  readonly size?: number
  readonly className?: string
}

/**
 * La càmera.
 *
 * El cercle interior va pintat del color del botó i no de `none`: a sobre del
 * `bg-brand-cta` un forat transparent deixaria veure el cos de la càmera i
 * l'objectiu es perdria. És el mateix truc que el dibuix del disseny.
 */
export function CameraIcon({ size = 21, className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={`block fill-current ${className}`}
    >
      <rect x="2.5" y="7" width="19" height="13" rx="1.6" />
      <path d="M8.6 7 10 4.2h4L15.4 7z" />
      <circle cx="12" cy="13.5" r="3.6" className="fill-[var(--ds-brand-cta)]" />
    </svg>
  )
}

/** La galeria: dues fotos, una a sobre de l'altra. La mateixa del DiptricMark. */
export function GalleryIcon({ size = 21, className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={`block fill-current ${className}`}
    >
      <rect x="3" y="5" width="8.2" height="14" rx="1" />
      <rect
        x="14.2"
        y="6"
        width="6.8"
        height="12"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  )
}
