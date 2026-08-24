import { Avatar } from 'app-comi'

/**
 * A local data URI rather than a remote photograph: the capture runs offline,
 * and a picture that fails to load would be grading the fallback instead of
 * the image path.
 */
const FACE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23d8a26a'/%3E%3Cstop offset='1' stop-color='%238c4a2f'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='120' height='120' fill='url(%23g)'/%3E%3Ccircle cx='60' cy='46' r='22' fill='%23f2ded0'/%3E%3Cpath d='M18 120c0-25 19-40 42-40s42 15 42 40z' fill='%23f2ded0'/%3E%3C/svg%3E"

/** A member's picture, at the sizes the app uses it. */
export function Sizes() {
  return (
    <div className="flex items-end gap-6">
      <Avatar src={FACE} size={34} />
      <Avatar src={FACE} size={46} />
      <Avatar src={FACE} size={52} />
      <Avatar src={FACE} size={72} />
    </div>
  )
}

/** No picture, or one that failed to load: the prototype's striped placeholder. */
export function Placeholder() {
  return (
    <div className="flex items-end gap-6">
      <Avatar src={null} size={34} />
      <Avatar src={null} size={46} />
      <Avatar src={null} size={72} />
    </div>
  )
}

/** `ring` marks the row that is you — a brand outline, offset by one pixel. */
export function TheRowThatIsYou() {
  return (
    <div className="flex items-end gap-6">
      <Avatar src={FACE} size={52} ring />
      <Avatar src={null} size={52} ring />
    </div>
  )
}

/** In a ranking row, which is where most of them live. */
export function InARankingRow() {
  return (
    <div className="w-[330px] divide-y divide-border-hair">
      {[
        ['1', 'Marta Puig', '412'],
        ['2', 'Jordi Sala', '388'],
        ['3', 'Nil Ferrer', '351'],
      ].map(([pos, name, pts], i) => (
        <div key={pos} className="flex items-center gap-5 py-4">
          <span className="w-6 text-sm font-bold text-fg-dim tabular-nums">{pos}</span>
          <Avatar src={i === 1 ? null : FACE} size={34} ring={i === 1} />
          <span className="flex-1 text-base font-semibold text-fg">{name}</span>
          <span className="text-base font-bold text-brand-accent tabular-nums">{pts}</span>
        </div>
      ))}
    </div>
  )
}
