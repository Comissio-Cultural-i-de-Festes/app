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
  hintId,
  children,
}: {
  readonly label: string
  readonly hint?: string
  /**
   * L'identificador del `<p>` de la pista, quan qui crida vol que el seu camp
   * hi apunti amb `aria-describedby`.
   *
   * SENSE AIXÒ LA PISTA NO ARRIBA A QUI NO LA VEU. És un germà del grup, o
   * sigui que no entra al nom accessible del camp ni a la seva descripció: qui
   * navega amb lector de pantalla sent «Per què» i prou, i la frase que diu
   * que allò es publicarà al perfil del soci —la decisió més delicada
   * d'aquesta pantalla— no es diu enlloc.
   *
   * ÉS OPCIONAL I NO OBLIGATORI perquè `Field` el fan servir deu pantalles i
   * la majoria hi posen un únic control amb `aria-label` propi; obligar-les
   * totes a passar un id per fer-hi apuntar un `aria-describedby` que no
   * escriuen hauria estat tocar-ne deu per arreglar-ne una. Qui vulgui la
   * pista descrita, la demana.
   */
  readonly hintId?: string
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
        <p
          id={hintId}
          className="mt-4 text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]"
        >
          {hint}
        </p>
      )}
    </div>
  )
}
