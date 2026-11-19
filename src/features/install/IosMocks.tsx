/**
 * The two Safari mock-ups from the prototype.
 *
 * Neither draws the toolbar or the neighbours of the row. Where Share sits
 * (bottom bar, top bar) and what surrounds "Add to Home Screen" changed between
 * iOS 16, 17 and 18, so a picture of either would be right for some iPhones and
 * wrong for the rest. Only the two things that stay put are drawn.
 *
 * They are drawn rather than screenshotted so they follow the theme, stay
 * sharp at any density, and weigh nothing. They are decoration for a screen
 * reader — the steps are described in the text beside them — so both are
 * aria-hidden.
 */

/** Step 1: the Share icon, picked out in brand red, with no bar around it. */
export function SafariToolbarMock() {
  return (
    <div
      aria-hidden
      className="mt-3 flex items-center justify-center border border-surface-7 bg-surface-2 px-[14px] py-[11px]"
    >
      <span className="flex h-[40px] w-[46px] items-center justify-center border-2 border-[var(--ds-brand-strong)]">
        <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
          <path
            d="M10 2 L10 14"
            stroke="var(--ds-brand-label-hi)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M5.5 6.5 L10 2 L14.5 6.5"
            stroke="var(--ds-brand-label-hi)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3.5 11 L3.5 21.5 L16.5 21.5 L16.5 11"
            stroke="var(--ds-brand-label-hi)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </div>
  )
}

interface ShareSheetMockProps {
  readonly target: string
}

/** Step 2: the row to look for, on its own. */
export function SafariShareSheetMock({ target }: ShareSheetMockProps) {
  return (
    <div aria-hidden className="mt-3 border border-surface-7 bg-surface-2">
      <div className="flex items-center gap-3 bg-brand-tint px-[14px] py-[13px] shadow-[inset_3px_0_0_var(--ds-brand)]">
        <span className="flex size-[22px] flex-none items-center justify-center border-[1.5px] border-[var(--ds-text-secondary)] text-[15px] font-extrabold">
          +
        </span>
        <span className="flex-1 text-[14.5px] font-bold">{target}</span>
      </div>
    </div>
  )
}
