import { RankingIcon } from 'app-comi'

/** Three rising bars. Colour and size come from the parent's classes. */
export function States() {
  return (
    <div className="flex items-center gap-9">
      <span className="text-fg-dim">
        <RankingIcon />
      </span>
      <span className="text-brand-icon">
        <RankingIcon />
      </span>
      <RankingIcon className="h-[34px] w-[34px] text-fg" />
    </div>
  )
}

/** In its slot, current. */
export function InATabSlot() {
  return (
    <div className="flex w-[78px] flex-col items-center gap-2">
      <RankingIcon className="h-[21px] w-[21px] text-brand-icon" />
      <span className="text-3xs leading-none font-bold text-brand-label">Rànquing</span>
    </div>
  )
}
