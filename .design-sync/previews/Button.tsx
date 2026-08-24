import { Button } from 'app-comi'

/** The default: one decision, full width, brand red, square corners. */
export function Primary() {
  return <Button>Confirma l&apos;assistència</Button>
}

/** The four variants, in the order they escalate. */
export function Variants() {
  return (
    <div className="flex flex-col gap-4">
      <Button variant="primary">Confirma l&apos;assistència</Button>
      <Button variant="secondary">Canvia la resposta</Button>
      <Button variant="ghost">Ara no</Button>
      <Button variant="destructive">Retiro el cotxe</Button>
    </div>
  )
}

/** md and lg are the body face; hero is the display face, shouted. */
export function Sizes() {
  return (
    <div className="flex flex-col gap-4">
      <Button size="md">Puja a un cotxe</Button>
      <Button size="lg">Ofereix el meu cotxe</Button>
      <Button size="hero">Entra</Button>
    </div>
  )
}

/**
 * The rule the component exists to enforce: CTAs grow, they never clip.
 * Catalan runs 15–20% longer than English, so the label wraps and the button
 * gets taller — there is no height, no nowrap and no ellipsis anywhere in it.
 */
export function LongLabelWraps() {
  return (
    <div className="w-[240px]">
      <Button>Condueixo jo i ofereixo places</Button>
    </div>
  )
}

/** Disabled drops to 45% and stops the press animation. */
export function Disabled() {
  return (
    <div className="flex flex-col gap-4">
      <Button disabled>Confirma l&apos;assistència</Button>
      <Button variant="secondary" disabled>
        Canvia la resposta
      </Button>
    </div>
  )
}
