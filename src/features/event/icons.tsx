/**
 * La icona de calendari.
 *
 * Mateix traç que les de la barra de pestanyes i les insígnies: viewBox de 24,
 * `currentColor`, `<rect rx>` i res de detall fi. El marc va buit amb un
 * `stroke` i els dies són quadrats plens —a 21 píxels sobre fons fosc, un
 * calendari amb línies de graella es converteix en una taca grisa.
 *
 * `aria-hidden` sempre: va dins d'un botó que ja diu què fa.
 */

export function CalendarIcon({
  size = 21,
  className = '',
}: {
  readonly size?: number
  readonly className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={`block fill-current ${className}`}
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect x="6.5" y="2.4" width="2.6" height="4.2" rx="1" />
      <rect x="14.9" y="2.4" width="2.6" height="4.2" rx="1" />
      <rect x="6.7" y="11" width="3.2" height="3.2" rx="1" />
      <rect x="14.1" y="11" width="3.2" height="3.2" rx="1" />
      <rect x="6.7" y="16" width="3.2" height="3.2" rx="1" />
    </svg>
  )
}
