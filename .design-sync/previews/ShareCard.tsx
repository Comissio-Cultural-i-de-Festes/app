import { ShareCard } from 'app-comi'

/**
 * The button draws nothing until it is pressed — a 1080×1920 canvas and a font
 * load is not something to do on the off chance — so the `card` thunk below is
 * never called in a preview. What the cards show is the button's resting
 * state, which is the whole component until somebody touches it.
 *
 * The label tells the truth about which of the two things the phone can do:
 * on one that cannot share files it says "save it to your roll" from the
 * start rather than promising a share sheet and producing a download. Headless
 * chromium is one of those, so that is the label these cards capture.
 */
const card = () =>
  Promise.resolve({
    kind: 'checkin',
    photo: null,
    when: 'Divendres 12 de setembre · 23:41',
    headline: 'Ja sóc dins',
    what: 'Benvinguda 25/26 · Nau 3',
    count: '28 de 30 ja hi som',
  } as never)

/** Solid: the primary action on the check-in and recap screens. */
export function Solid() {
  return (
    <div className="w-[358px]">
      <ShareCard card={card} name={['comi', 'benvinguda', 'fitxatge']} text="Ja sóc dins" />
    </div>
  )
}

/**
 * Quiet: the same control where the screen already has a louder button, e.g.
 * under the diptych.
 */
export function Quiet() {
  return (
    <div className="w-[358px]">
      <ShareCard card={card} name={['comi', 'la-meva-nit']} text="La meva nit" variant="quiet" />
    </div>
  )
}

/** Both, so the two weights can be compared at the width they are used. */
export function BothVariants() {
  return (
    <div className="flex w-[358px] flex-col gap-9">
      <ShareCard card={card} name={['comi', 'fitxatge']} text="Ja sóc dins" />
      <ShareCard card={card} name={['comi', 'ranquing']} text="Rànquing" variant="quiet" />
    </div>
  )
}
