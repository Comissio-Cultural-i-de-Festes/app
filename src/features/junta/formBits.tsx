import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useId,
} from 'react'

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
  'text-lg font-semibold text-fg caret-[var(--ds-brand-strong)] ' +
  'placeholder:font-medium placeholder:text-fg-faint'

const CONTROLS = new Set(['input', 'textarea', 'select'])

/**
 * Un control de formulari que encara no té nom propi. Un `placeholder` no
 * compta: no és un nom accessible i desapareix en escriure.
 */
function isUnnamedControl(node: ReactNode): node is ReactElement<Record<string, unknown>> {
  if (!isValidElement<Record<string, unknown>>(node)) return false
  if (typeof node.type !== 'string' || !CONTROLS.has(node.type)) return false
  // Un `id` no compta: sense un `<label htmlFor>` que hi apunti no dóna cap
  // nom, i els camps d'aquí no en duen.
  return node.props['aria-label'] === undefined && node.props['aria-labelledby'] === undefined
}

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
  //
  // El nom del control, per tant, el posa `Field`: cada `input`, `textarea` o
  // `select` fill directe que no en dugui apunta a la mateixa etiqueta. Així
  // els quaranta-quatre camps que passen per aquí en tenen sense que cadascun
  // hagi de repetir l'`aria-label`, que és el que s'oblidava. Amb nom propi no es
  // toca. UN CONTROL DINS D'UN ALTRE ELEMENT (un `div`, un fragment) NO ES
  // COBREIX: no es recorre l'arbre, i qui el posi així ha de portar el seu nom.
  const id = useId()
  const named = Children.map(children, (child) =>
    isUnnamedControl(child) ? cloneElement(child, { 'aria-labelledby': id }) : child,
  )
  return (
    <div className="pb-9">
      <span id={id} className="block eyebrow text-fg-muted">
        {label}
      </span>
      <div role="group" aria-labelledby={id}>
        {named}
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
