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
  /**
   * La vora en ambre quan el que hi ha escrit no val. Ambre i no vermell: el
   * vermell és el color de l'associació i no pot voler dir «malament» enlloc.
   *
   * Va a la CAIXA i no només al text de sota perquè és el que ja fan les
   * pantalles de junta d'aquest mateix lot i el camp del telèfon de l'alta: el
   * refús es veu on és el problema, i la frase de sota diu per què. Amb el
   * color només al text, l'ull que torna al formulari no sap quin camp mirar.
   */
  readonly invalid?: boolean
}

const LABEL = 'eyebrow-sm text-fg-muted'

export function FieldShell({
  label,
  children,
  aside,
  htmlFor,
  variant = 'solid',
  invalid = false,
}: FieldShellProps) {
  const solid = invalid ? 'border-warning' : 'border-border-strong focus-within:border-brand-strong'
  const edge = variant === 'dashed' ? 'border-dashed border-[var(--ds-border-input)]' : solid

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

/**
 * `outline-none` a l'`<input>`, i què el substitueix. La regla global de
 * `base.css` dibuixa 2px de marca a `:focus-visible`, i aquesta classe l'apaga:
 * el focus d'un camp de text es marca amb la VORA de la caixa (`FieldShell`,
 * amb `focus-within`) en el color de marca, i el cursor també hi és.
 *
 * Vora i no contorn perquè `:focus-visible` casa també quan un camp de text es
 * toca amb el dit —és així per definició, perquè s'hi espera teclat—, i un
 * contorn de 2px amb separació a tot camp de l'app canviaria com es veu al
 * mòbil cada formulari. La vora ja hi és i només canvia de color. `focus-within` i no
 * `:has(:focus-visible)` perquè és el que entenen tots els iOS que es donen
 * suport. La mateixa vora (`focus:border-brand-strong`) la porten `INPUT` de
 * la junta i els camps inlinats: una sola regla per als camps de text.
 */
export function TextField({ id, label, ref, prefix, ...rest }: TextFieldProps) {
  // Es llegeix d'`aria-invalid` i no d'un prop nou: el camp ja l'ha de portar
  // per al lector de pantalla, i dos interruptors per al mateix estat és com
  // s'arriba a una vora en ambre amb un camp que es diu vàlid.
  const invalid = rest['aria-invalid'] === true || rest['aria-invalid'] === 'true'

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
    <FieldShell label={label} htmlFor={id} invalid={invalid}>
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
