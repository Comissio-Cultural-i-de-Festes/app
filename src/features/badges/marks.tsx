/**
 * Les deu marques.
 *
 * Dibuixades amb el mateix traç que les icones de la barra de pestanyes:
 * geomètriques, planes, sense degradats ni ombres, i sempre `currentColor` —
 * qui les pinta decideix el color, i això és el que fa que la mateixa marca
 * serveixi per a guanyada (tinta de marca sobre el tint) i per a pendent (el
 * mateix dibuix, apagat) sense duplicar-ne cap.
 *
 * Cap `aria-label`: el títol de la targeta ja diu quina és, i una icona que
 * repeteix el text del costat és una cosa que un lector de pantalla llegeix dos
 * cops.
 */

export type Mark = (props: { readonly size: number }) => React.ReactElement

function Svg({ size, children }: { readonly size: number; readonly children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  )
}

/** Una porta. El primer fitxatge és haver entrat per una. */
export const PortaMark: Mark = ({ size }) => (
  <Svg size={size}>
    <rect
      x="5.5"
      y="3"
      width="13"
      height="18"
      rx="1.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
    <circle cx="15" cy="12.5" r="1.7" />
  </Svg>
)

/** La cara del cinc d'un dau: comptar activitats. */
export const DauMark: Mark = ({ size }) => (
  <Svg size={size}>
    <circle cx="6" cy="6" r="2.4" />
    <circle cx="18" cy="6" r="2.4" />
    <circle cx="12" cy="12" r="2.4" />
    <circle cx="6" cy="18" r="2.4" />
    <circle cx="18" cy="18" r="2.4" />
  </Svg>
)

/** Una casa amb teulada: la casa rural. */
export const CasaMark: Mark = ({ size }) => (
  <Svg size={size}>
    <path d="M12 3.2 21 11h-2.6v10H5.6V11H3z" />
  </Svg>
)

/** Tres formes diferents: festa, casa rural i activitat. */
export const TresMark: Mark = ({ size }) => (
  <Svg size={size}>
    <circle cx="7" cy="6.5" r="3.4" />
    <rect x="14" y="3.5" width="6.6" height="6.6" rx="1.2" />
    <path d="M12 13.6l5 7.4H7z" />
  </Svg>
)

/** Un volant. */
export const VolantMark: Mark = ({ size }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="2.7" />
    <path
      d="M12 14.5V20M4.2 10.5l5.4 1M19.8 10.5l-5.4 1"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
    />
  </Svg>
)

/** Dues barres creuades: muntar. */
export const MuntarMark: Mark = ({ size }) => (
  <Svg size={size}>
    <rect x="10.5" y="1.5" width="3" height="21" rx="1.5" transform="rotate(45 12 12)" />
    <rect x="10.5" y="1.5" width="3" height="21" rx="1.5" transform="rotate(-45 12 12)" />
  </Svg>
)

/** Dos cercles, un buit i un ple: anar al cotxe d'algú. */
export const CopilotMark: Mark = ({ size }) => (
  <Svg size={size}>
    <circle cx="7.5" cy="12" r="4.4" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="16.5" cy="12" r="4.4" />
  </Svg>
)

/** Un globus de diàleg: una idea que has dit tu. */
export const IdeaMark: Mark = ({ size }) => (
  <Svg size={size}>
    <path d="M3.5 4h17v11.5H9.5L5 20.2v-4.7H3.5z" />
  </Svg>
)

/** Dos rectangles: el díptic d'entrada i sortida. */
export const DiptricMark: Mark = ({ size }) => (
  <Svg size={size}>
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
  </Svg>
)

/** Un llamp: arribar dels primers. */
export const LlampMark: Mark = ({ size }) => (
  <Svg size={size}>
    <path d="M13.2 2 5.6 13.6h4.9L9.3 22l8.9-12.4h-5z" />
  </Svg>
)
