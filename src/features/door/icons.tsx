import type { ScanIcon } from '@/design/states'

/**
 * The eight shapes a scan can come back as.
 *
 * These carry the verdict. Colour reinforces them and never replaces them —
 * at four in the morning, at low brightness, two warm hues look alike and a
 * tick and a cross do not. Drawn rather than typed as characters so they hold
 * their weight at 34 pixels on every phone.
 */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export function ScanGlyph({
  icon,
  size = 34,
}: {
  readonly icon: ScanIcon
  readonly size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="flex-none"
      {...STROKE}
    >
      {PATHS[icon]}
    </svg>
  )
}

const PATHS: Record<ScanIcon, React.ReactNode> = {
  check: <path d="M4 12.5 9.5 18 20 6" />,
  'check-plus': (
    <>
      <path d="M3 12.5 8 17.5 16.5 7" />
      <path d="M19 13v6M16 16h6" />
    </>
  ),
  'check-alert': (
    <>
      <path d="M3 12.5 8 17.5 16.5 7" />
      <path d="M19 12v4.5" />
      <path d="M19 20h.01" />
    </>
  ),
  cross: <path d="M6 6l12 12M18 6 6 18" />,
  question: (
    <>
      <path d="M9 9a3 3 0 1 1 3.6 2.94c-.9.2-1.6 1-1.6 1.96v.6" />
      <path d="M11 18h.01" />
      <circle cx="12" cy="12" r="9.2" />
    </>
  ),
  pause: (
    <>
      <path d="M9.5 8.5v7M14.5 8.5v7" />
      <circle cx="12" cy="12" r="9.2" />
    </>
  ),
  lock: (
    <>
      <rect x="4.2" y="10.5" width="15.6" height="10" rx="1.6" />
      <path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.6 1.9 20.4h20.2z" />
      <path d="M12 9.6v4.6" />
      <path d="M12 17.4h.01" />
    </>
  ),
}
