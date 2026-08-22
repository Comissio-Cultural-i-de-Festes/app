/** 21px line icons, drawn to match the prototype. `currentColor` throughout so
 *  the colour tokens on the parent drive them. */

interface IconProps {
  readonly className?: string
}

const base = 'h-[21px] w-[21px]'

export function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 21 21" fill="currentColor" aria-hidden className={className ?? base}>
      <rect x="2.5" y="2.5" width="7" height="7" rx="1.5" />
      <rect x="11.5" y="2.5" width="7" height="7" rx="1.5" />
      <rect x="2.5" y="11.5" width="7" height="7" rx="1.5" />
      <rect x="11.5" y="11.5" width="7" height="7" rx="1.5" />
    </svg>
  )
}

export function RankingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 21 21" fill="currentColor" aria-hidden className={className ?? base}>
      <rect x="2.5" y="12" width="4" height="6.5" rx="1" />
      <rect x="8.5" y="7" width="4" height="11.5" rx="1" />
      <rect x="14.5" y="3" width="4" height="15.5" rx="1" />
    </svg>
  )
}

export function QrIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 22 22"
      fill="currentColor"
      aria-hidden
      className={className ?? 'h-[22px] w-[22px]'}
    >
      <rect x="2" y="2" width="7" height="7" rx="1" />
      <rect x="13" y="2" width="7" height="7" rx="1" />
      <rect x="2" y="13" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="3" height="3" />
      <rect x="17.5" y="17.5" width="3" height="3" />
    </svg>
  )
}

export function ProposalsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 21 21" fill="none" aria-hidden className={className ?? base}>
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function ProfileIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 21 21" fill="none" aria-hidden className={className ?? base}>
      <circle cx="10.5" cy="7" r="3.8" stroke="currentColor" strokeWidth="2" />
      <circle cx="10.5" cy="19.5" r="7" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
