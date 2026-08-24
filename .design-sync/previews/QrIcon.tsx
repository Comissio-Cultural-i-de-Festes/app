import { QrIcon } from 'app-comi'

/**
 * The centre slot is an action, not a tab, so this glyph is the only one that
 * normally sits on brand rather than beside it.
 */
export function OnTheBrandSquare() {
  return (
    <span className="grid size-[44px] place-items-center rounded-card bg-brand text-on-brand shadow-brand">
      <QrIcon />
    </span>
  )
}

/** On its own, driven by the parent's colour like every other icon. */
export function States() {
  return (
    <div className="flex items-center gap-9">
      <span className="text-fg-dim">
        <QrIcon />
      </span>
      <span className="text-brand-icon">
        <QrIcon />
      </span>
      <QrIcon className="h-[34px] w-[34px] text-fg" />
    </div>
  )
}

/** In its slot: the square, then the label under it. */
export function InATabSlot() {
  return (
    <div className="flex w-[78px] flex-col items-center gap-2">
      <span className="grid size-[44px] place-items-center rounded-card bg-brand text-on-brand shadow-brand">
        <QrIcon />
      </span>
      <span className="text-3xs leading-none font-medium text-fg-muted-lo">El meu QR</span>
    </div>
  )
}
