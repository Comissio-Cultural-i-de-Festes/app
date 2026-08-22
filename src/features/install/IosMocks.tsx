/**
 * The two Safari mock-ups from the prototype.
 *
 * They are drawn rather than screenshotted so they follow the theme, stay
 * sharp at any density, and weigh nothing. They are decoration for a screen
 * reader — the steps are described in the text beside them — so both are
 * aria-hidden.
 */

/** Step 1: the Safari toolbar, with Share picked out in brand red. */
export function SafariToolbarMock() {
  return (
    <div
      aria-hidden
      className="mt-3 flex items-center justify-between border border-surface-7 bg-surface-2 px-[14px] py-[11px]"
    >
      <span className="text-lg text-[var(--ds-text-faint)]">‹ ›</span>

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

      <span className="text-lg text-[var(--ds-text-faint)]">⧉</span>
    </div>
  )
}

interface SheetRowProps {
  readonly label: string
  readonly highlighted?: boolean
  readonly border?: 'top' | 'bottom'
}

function SheetRow({ label, highlighted = false, border }: SheetRowProps) {
  const edge =
    border === 'top'
      ? 'border-t border-surface-6'
      : border === 'bottom'
        ? 'border-b border-surface-6'
        : ''

  if (highlighted) {
    return (
      <div className="flex items-center gap-3 bg-brand-tint px-[14px] py-[13px] shadow-[inset_3px_0_0_var(--ds-brand)]">
        <span className="flex size-[22px] flex-none items-center justify-center border-[1.5px] border-[var(--ds-text-secondary)] text-[15px] font-extrabold">
          +
        </span>
        <span className="flex-1 text-[14.5px] font-bold">{label}</span>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-3 px-[14px] py-[13px] text-fg-muted ${edge}`}>
      <span className="size-[22px] flex-none border-[1.5px] border-[var(--ds-text-faint)]" />
      <span className="flex-1 text-[14.5px]">{label}</span>
    </div>
  )
}

interface ShareSheetMockProps {
  /** Neighbouring rows, so the one that matters is visibly in a list. */
  readonly above: string
  readonly target: string
  readonly below: string
}

/** Step 2: the share sheet, with the row to look for highlighted. */
export function SafariShareSheetMock({ above, target, below }: ShareSheetMockProps) {
  return (
    <div aria-hidden className="mt-3 border border-surface-7 bg-surface-2">
      <SheetRow label={above} border="bottom" />
      <SheetRow label={target} highlighted />
      <SheetRow label={below} border="top" />
    </div>
  )
}
