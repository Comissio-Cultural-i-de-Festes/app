import type { ButtonHTMLAttributes, Ref } from 'react'

/**
 * The primary action.
 *
 * Two rules from the brief are encoded here rather than left to discipline:
 *
 * 1. CTAs are SQUARE. `--ds-radius-cta` is 0. The si/potser/no buttons and the
 *    point-reason buttons have no radius in the prototype and that is the
 *    look, not an oversight.
 *
 * 2. CTAs GROW, they never clip. Catalan runs 15-20% longer than English and
 *    Spanish can run longer still, so there is no `height`, no `nowrap` and no
 *    ellipsis anywhere below — only `min-height`. "Confirma l'assistència" has
 *    to wrap to two lines and make the button taller.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
export type ButtonSize = 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly ref?: Ref<HTMLButtonElement>
}

const BASE =
  'inline-flex w-full items-center justify-center rounded-cta border-0 ' +
  'px-[var(--ds-btn-pad-x)] py-[var(--ds-btn-pad-y)] ' +
  'font-body text-xl font-bold leading-[var(--ds-btn-leading)] text-center ' +
  '[text-wrap:balance] whitespace-normal [overflow-wrap:break-word] hyphens-auto ' +
  'cursor-pointer [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] ' +
  'transition-[background-color,transform] duration-[var(--ds-dur-base)] ease-[var(--ds-ease)] ' +
  'active:scale-[0.985] disabled:cursor-default disabled:opacity-45 disabled:active:scale-100'

const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-[var(--ds-btn-min-h)]',
  lg: 'min-h-[var(--ds-btn-min-h-lg)]',
}

const VARIANTS: Record<ButtonVariant, string> = {
  // brand-cta, not brand: the identity red fails AA behind a label. See tokens.css.
  primary: 'bg-brand-cta text-on-brand hover:bg-[var(--ds-brand-hover)]',
  secondary: 'bg-surface-2 text-fg shadow-[inset_0_0_0_1px_var(--ds-border-strong)]',
  ghost: 'bg-transparent text-fg-secondary',
  // Amber, not red. Red is the association, not danger.
  destructive: 'bg-transparent text-warning',
}

export function Button({ variant = 'primary', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={[BASE, SIZES[size], VARIANTS[variant], className].filter(Boolean).join(' ')}
    />
  )
}

/**
 * A row of CTAs, e.g. si / potser / no.
 *
 * Grid with `items-stretch` so all of them match the tallest. Without it a
 * two-line "potser" leaves the row ragged, which is how "grow, don't clip"
 * usually falls apart in practice.
 */
export function ButtonGroup({ children }: { readonly children: React.ReactNode }) {
  return <div className="grid grid-flow-col auto-cols-fr items-stretch gap-[6px]">{children}</div>
}
