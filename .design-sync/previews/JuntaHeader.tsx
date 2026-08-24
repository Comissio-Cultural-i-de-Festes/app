import { JuntaHeader } from 'app-comi'

/**
 * Junta screens have no tab bar — they are somewhere you go into and come back
 * out of — so each one draws its own way out. Every cell is phone width
 * because the header is gutter-padded and spans a whole screen.
 */

/** Back link and title, which is the shape nearly every junta screen uses. */
export function WithATitle() {
  return (
    <div className="w-[390px]">
      <JuntaHeader to="/junta" label="Junta" title="Portes" />
    </div>
  )
}

/** Just the way out, for a screen whose title is drawn by its own content. */
export function LinkOnly() {
  return (
    <div className="w-[390px]">
      <JuntaHeader to="/junta" label="Junta" />
    </div>
  )
}

/** `aside` takes the right of the link row — usually the screen's one action. */
export function WithAnAction() {
  return (
    <div className="w-[390px]">
      <JuntaHeader
        to="/junta"
        label="Junta"
        title="Esdeveniments"
        aside={
          <span className="min-h-[44px] px-4 py-4 text-md font-bold text-brand-accent">Nou</span>
        }
      />
    </div>
  )
}

/** A long title wraps and the header grows; nothing is clipped. */
export function ALongTitle() {
  return (
    <div className="w-[390px]">
      <JuntaHeader to="/junta" label="Junta" title="Graus i períodes de rànquing" />
    </div>
  )
}
