import { Cover } from 'app-comi'

/**
 * A local data URI, not a remote photograph: the capture runs offline, so a
 * fetched image would grade the empty state by accident.
 */
const PHOTO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='260'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23f0a24a'/%3E%3Cstop offset='.55' stop-color='%23c0392b'/%3E%3Cstop offset='1' stop-color='%23331014'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='260' fill='url(%23g)'/%3E%3Ccircle cx='96' cy='72' r='40' fill='%23ffd9a0' opacity='.55'/%3E%3Cpath d='M0 200l90-58 74 44 86-62 150 92v44H0z' fill='%23200b0e' opacity='.75'/%3E%3C/svg%3E"

/** The back link the event screen puts in the corner. */
function Back() {
  return (
    <span className="flex min-h-[44px] items-center gap-1 rounded-full bg-[oklch(0.15_0.012_25/0.7)] px-5 text-md font-bold text-fg no-underline backdrop-blur-[8px]">
      <span aria-hidden="true" className="text-lg">
        ‹
      </span>
      Inici
    </span>
  )
}

/** With a photograph, and the gradient that keeps the corner legible over it. */
export function WithAPhoto() {
  return (
    <div className="w-[390px]">
      <Cover coverUrl={PHOTO} isPast={false} corner={<Back />} />
    </div>
  )
}

/**
 * No photograph: the striped placeholder, the same one an avatar without a
 * picture falls back to.
 */
export function NoPhoto() {
  return (
    <div className="w-[390px]">
      <Cover coverUrl={null} isPast={false} corner={<Back />} />
    </div>
  )
}

/** Past events carry a badge in the opposite corner. */
export function AlreadyHappened() {
  return (
    <div className="w-[390px]">
      <Cover coverUrl={PHOTO} isPast corner={<Back />} />
    </div>
  )
}

/**
 * The corner is a slot, not a back link: the junta's preview puts a close
 * button there, which is the reason it is a prop at all.
 */
export function WithACloseButton() {
  return (
    <div className="w-[390px]">
      <Cover
        coverUrl={PHOTO}
        isPast={false}
        corner={
          <span className="grid size-[44px] place-items-center rounded-full bg-[oklch(0.15_0.012_25/0.7)] text-lg font-bold text-fg backdrop-blur-[8px]">
            ✕
          </span>
        }
      />
    </div>
  )
}
