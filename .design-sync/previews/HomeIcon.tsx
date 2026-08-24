import { HomeIcon } from 'app-comi'

/**
 * Four squares, not a house: the home tab is the grid of what is on, and a
 * roof-and-door glyph would promise a dwelling.
 *
 * Every icon here is `fill: currentColor` with no size of its own beyond the
 * 21px default, so colour and size both come from the class the parent puts
 * on it. That is the whole API.
 */
export function States() {
  return (
    <div className="flex items-center gap-9">
      <span className="text-fg-dim">
        <HomeIcon />
      </span>
      <span className="text-brand-icon">
        <HomeIcon />
      </span>
      <HomeIcon className="h-[34px] w-[34px] text-fg" />
    </div>
  )
}

/** In its slot: glyph over a label, the way the tab bar composes it. */
export function InATabSlot() {
  return (
    <div className="flex w-[78px] flex-col items-center gap-2">
      <HomeIcon className="h-[21px] w-[21px] text-brand-icon" />
      <span className="text-3xs leading-none font-bold text-brand-label">Inici</span>
    </div>
  )
}
