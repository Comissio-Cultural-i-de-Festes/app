import { TabBar } from 'app-comi'

const LABELS = {
  home: 'Inici',
  ranking: 'Rànquing',
  qr: 'El meu QR',
  proposals: 'Idees',
  profile: 'Perfil',
} as const

const HREFS = {
  home: '/',
  ranking: '/ranquing',
  qr: '/qr',
  proposals: '/idees',
  profile: '/perfil',
} as const

/**
 * The bar is `position: fixed`, so it would escape any card it is dropped
 * into. A transform on the wrapper makes it the containing block, which pins
 * the bar to the bottom of the frame instead of the viewport — the same shape
 * the app gives it, at phone width.
 */
function Phone({ children }: { readonly children: React.ReactNode }) {
  return (
    <div
      className="relative w-[390px] overflow-hidden border border-border bg-app"
      style={{ height: 132, transform: 'translateZ(0)' }}
    >
      {children}
    </div>
  )
}

/** Five slots, My QR in the centre as a brand action rather than a tab. */
export function Default() {
  return (
    <Phone>
      <TabBar
        current="home"
        hrefs={HREFS}
        labels={LABELS}
        navLabel="Navegació principal"
        comingSoonLabel="encara no"
      />
    </Phone>
  )
}

/** The current tab: brand icon, brand label, bold. */
export function OnRanking() {
  return (
    <Phone>
      <TabBar
        current="ranking"
        hrefs={HREFS}
        labels={LABELS}
        navLabel="Navegació principal"
        comingSoonLabel="encara no"
      />
    </Phone>
  )
}

/**
 * A tab with no `href` renders as a disabled button at 45% — dimmed but still
 * focusable, and still announced, with the coming-soon suffix on its label.
 */
export function TabNotShippedYet() {
  return (
    <Phone>
      <TabBar
        current="home"
        hrefs={{ home: '/', qr: '/qr', profile: '/perfil' }}
        labels={LABELS}
        navLabel="Navegació principal"
        comingSoonLabel="encara no"
      />
    </Phone>
  )
}
