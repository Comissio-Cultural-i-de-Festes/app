import { ProposalsIcon } from 'app-comi'

/** The ideas tab. Colour and size come from the parent's classes. */
export function States() {
  return (
    <div className="flex items-center gap-9">
      <span className="text-fg-dim">
        <ProposalsIcon />
      </span>
      <span className="text-brand-icon">
        <ProposalsIcon />
      </span>
      <ProposalsIcon className="h-[34px] w-[34px] text-fg" />
    </div>
  )
}

/**
 * Dimmed at 45%, which is how the bar draws a tab whose screen has not
 * shipped: the slot stays, and the reason is on the label rather than in the
 * colour alone.
 */
export function NotShippedYet() {
  return (
    <div className="flex w-[78px] flex-col items-center gap-2 opacity-45">
      <ProposalsIcon className="h-[21px] w-[21px] text-fg-dim" />
      <span className="text-3xs leading-none font-medium text-fg-muted-lo">Idees</span>
    </div>
  )
}
