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
  /**
   * Dashed for a block that stands for something absent — the "no invitation"
   * panel on the door, which has the shape of the invitation block precisely
   * so the missing thing is legible as missing.
   */
  readonly variant?: 'solid' | 'dashed'
}

const LABEL = 'eyebrow-sm text-fg-muted'

export function FieldShell({
  label,
  children,
  aside,
  htmlFor,
  variant = 'solid',
}: FieldShellProps) {
  const edge =
    variant === 'dashed' ? 'border-dashed border-[var(--ds-border-input)]' : 'border-border-strong'

  return (
    <div
      className={`flex items-center justify-between gap-3 border ${edge} bg-surface-1 px-[18px] py-[15px]`}
    >
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
  /**
   * Un signe dibuixat davant del que s'escriu, com el `+34` del telèfon a
   * l'alta. Decoratiu i `aria-hidden`: no forma part del valor, i el camp
   * d'Instagram el fa servir precisament perquè l'`@` NO es desa.
   */
  readonly prefix?: string
}

export function TextField({ id, label, ref, prefix, ...rest }: TextFieldProps) {
  const input = (
    <input
      {...rest}
      id={id}
      ref={ref}
      className={
        'mt-[7px] min-h-[30px] w-full border-0 bg-transparent p-0 text-xl font-semibold ' +
        'text-fg caret-[var(--ds-brand-strong)] outline-none ' +
        'placeholder:text-[var(--ds-text-faint)] placeholder:font-normal'
      }
    />
  )

  return (
    <FieldShell label={label} htmlFor={id}>
      {prefix === undefined ? (
        input
      ) : (
        <div className="flex items-baseline gap-[3px]">
          <span
            aria-hidden="true"
            className="mt-[7px] flex-none text-xl font-semibold text-fg-faint"
          >
            {prefix}
          </span>
          {input}
        </div>
      )}
    </FieldShell>
  )
}
