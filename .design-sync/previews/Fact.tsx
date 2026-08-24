import { Fact } from 'app-comi'

/** One line of the event's facts: a fixed-width uppercase label, then the value. */
export function Single() {
  return (
    <div className="w-[358px]">
      <Fact label="Quan" value="Divendres 12 de setembre · 23:00 fins a les 04:00" />
    </div>
  )
}

/**
 * The list, which is how it is always used. The label column is a fixed 64px
 * so the values line up however short the label is.
 */
export function TheFactsBlock() {
  return (
    <div className="w-[358px]">
      <Fact label="Quan" value="Divendres 12 de setembre · 23:00 fins a les 04:00" />
      <Fact label="On" value="Nau 3, Polígon del Rengle. Mataró" />
      <Fact label="Preu" value="Gratis" />
      <Fact label="Com es torna" value="Hi ha tres cotxes oferts i queden places a dos." />
    </div>
  )
}

/** A value long enough to wrap, which is the normal case in Catalan. */
export function AValueThatWraps() {
  return (
    <div className="w-[300px]">
      <Fact label="On" value="Nau 3, Polígon del Rengle, entrada pel carrer de darrere. Mataró." />
    </div>
  )
}
