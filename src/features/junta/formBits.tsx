import { type ReactNode, useId } from 'react'

/**
 * The two pieces every junta form is made of.
 *
 * They lived inside EventFormScreen until the configuration screen needed the
 * same label and the same input. Copying them would have been three lines and
 * a slow divergence: the accessible-name fix below is exactly the kind of
 * thing that gets made once and never carried across.
 */

export const INPUT =
  'mt-4 min-h-[50px] w-full border-[1.5px] border-surface-7 bg-surface-1 px-[14px] py-[13px] ' +
  'text-lg font-semibold text-fg outline-none caret-[var(--ds-brand-strong)] ' +
  'placeholder:font-medium placeholder:text-fg-faint'

export function Field({
  label,
  hint,
  children,
}: {
  readonly label: string
  readonly hint?: string
  readonly children: ReactNode
}) {
  // Not `<label htmlFor>`: the id was landing on the wrapper div, which is not
  // a form control, so the association was void — no accessible name on any of
  // these inputs and no enlarged tap target from the label either. A named
  // group works for the three-button rows as well as the single inputs.
  const id = useId()
  return (
    <div className="pb-9">
      <span id={id} className="block eyebrow text-fg-muted">
        {label}
      </span>
      <div role="group" aria-labelledby={id}>
        {children}
      </div>
      {hint === undefined ? null : (
        <p className="mt-4 text-[12.5px] text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
          {hint}
        </p>
      )}
    </div>
  )
}
