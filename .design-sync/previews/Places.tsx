import { Places } from 'app-comi'

/**
 * The number is the reason somebody opens an event screen twice in an evening,
 * so it gets the display face at its largest and its own states.
 *
 * Every cell is phone width because the block is gutter-padded and belongs to
 * a full screen, not a card.
 */
function Screen({ children }: { readonly children: React.ReactNode }) {
  return <div className="w-[390px]">{children}</div>
}

/** Places still going: the plain state. */
export function Free() {
  return (
    <Screen>
      <Places total={30} puntos={12} left={8} going={22} isPast={false} waiting={0} />
    </Screen>
  )
}

/**
 * The last place is not the twentieth. It gets amber and a line saying it will
 * not last — the prototype gives it its own state on purpose.
 */
export function TheLastOne() {
  return (
    <Screen>
      <Places total={30} puntos={12} left={1} going={29} isPast={false} waiting={0} />
    </Screen>
  )
}

/** Full, with nobody waiting yet. */
export function FullNoQueue() {
  return (
    <Screen>
      <Places total={30} puntos={12} left={0} going={30} isPast={false} waiting={0} />
    </Screen>
  )
}

/** Full, with a queue — people do drop out, and the copy says so. */
export function FullWithAQueue() {
  return (
    <Screen>
      <Places total={30} puntos={12} left={0} going={30} isPast={false} waiting={4} />
    </Screen>
  )
}

/** Afterwards it stops counting places and counts who came, and the points. */
export function AfterTheEvent() {
  return (
    <Screen>
      <Places total={30} puntos={12} left={null} going={27} isPast waiting={0} />
    </Screen>
  )
}
