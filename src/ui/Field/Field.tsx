import type { InputHTMLAttributes, ReactNode, Ref } from 'react'

/**
 * The bordered block with an uppercase label above its contents, from the
 * invitation screen. Used for both the read-only invitation code and the
 * fields the person types into, which is why the shell is separate from the
 * input.
 *
 * Square, like everything else that takes a decision on these screens.
 */

interface FieldShellProps {
  readonly label: string
  readonly children: ReactNode
  /** Right-hand side of the label row, e.g. an expiry. */
  readonly aside?: ReactNode
  readonly htmlFor?: string
}

const LABEL = 'text-[11.5px] font-extrabold tracking-[0.14em] uppercase text-fg-muted'

export function FieldShell({ label, children, aside, htmlFor }: FieldShellProps) {
  return (
    <div className="flex items-center justify-between gap-3 border border-border-strong bg-surface-1 px-[18px] py-[15px]">
      <div className="min-w-0 flex-1">
        {htmlFor ? (
          <label className={`block ${LABEL}`} htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <div className={LABEL}>{label}</div>
        )}
        {children}
      </div>
      {aside}
    </div>
  )
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  readonly id: string
  readonly label: string
  readonly ref?: Ref<HTMLInputElement>
}

export function TextField({ id, label, ref, ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} htmlFor={id}>
      <input
        {...rest}
        id={id}
        ref={ref}
        className={
          'mt-[7px] w-full border-0 bg-transparent p-0 text-xl font-semibold ' +
          'text-fg caret-[var(--ds-brand-strong)] outline-none ' +
          'placeholder:text-[var(--ds-text-faint)] placeholder:font-normal'
        }
      />
    </FieldShell>
  )
}
