/**
 * A member's face, or the striped placeholder from the prototype.
 *
 * Pictures come from Google and are hosted there, so they can fail to load
 * behind a captive portal or when somebody has removed theirs since signing
 * in. A broken-image icon in a leaderboard of two hundred rows looks like the
 * app is broken, so a failure falls back to the same placeholder as no picture
 * at all.
 *
 * Decorative by default: every avatar in this app sits next to the name it
 * belongs to, and a screen reader announcing it twice is noise.
 *
 * `src` és o una URL absoluta —la de Google, que és el que hi ha per a tothom
 * que no s'hagi canviat la foto— o un camí del bucket `avatars`, que s'ha de
 * signar. Ho resol `useAvatarUrl` aquí dins i no cada pantalla: n'hi ha
 * vint-i-cinc, i la que s'oblidés de signar ensenyaria el marc trencat.
 */
import { useState } from 'react'

import { useAvatarUrl } from './useAvatarUrl'

export interface AvatarProps {
  readonly src: string | null
  readonly size: number
  /** Brand outline, for the row that is you. */
  readonly ring?: boolean
  readonly className?: string
}

export function Avatar({ src, size, ring = false, className = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false)
  const url = useAvatarUrl(src)
  const box = { width: size, height: size } as const
  const outline = ring ? 'outline-[1.5px] outline-brand outline-offset-1' : ''

  // `null` mentre se signa vol dir les ratlles un instant i després la cara,
  // que és el que ja passa amb una imatge que tarda. Un esquelet rodó aquí
  // faria parpellejar dues formes en comptes d'una.
  if (url === null || failed) {
    return (
      <span
        aria-hidden="true"
        style={box}
        // `block`, not just a sized span: inside a non-flex parent an inline
        // span ignores width and height entirely and the avatar collapses to
        // nothing, which looks like the data failed to load.
        className={`avatar-placeholder block flex-none ${outline} ${className}`}
      />
    )
  }

  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      // Google serves these cross-origin; without this the request carries a
      // referrer to a third party on every row of the ranking.
      referrerPolicy="no-referrer"
      onError={() => {
        setFailed(true)
      }}
      style={box}
      className={`flex-none rounded-full bg-[var(--ds-bg-avatar)] object-cover ${outline} ${className}`}
    />
  )
}
