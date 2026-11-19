import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Field, INPUT } from './formBits'

/**
 * El camp de formulari ha de tenir nom propi i no només un text d'exemple.
 *
 * `Field` etiqueta el grup, no el control; un `placeholder` no és un nom
 * accessible i desapareix en escriure. Aquí es comprova el que llegeix un
 * lector de pantalla, no pas les classes.
 */
describe('Field', () => {
  it('dona nom al camp de text encara que qui el fa servir no hi posi cap aria-label', () => {
    render(
      <Field label="Nom">
        <input placeholder="Cercavila" className={INPUT} />
      </Field>,
    )
    expect(screen.getByRole('textbox', { name: 'Nom' })).toBeInTheDocument()
  })

  it('dona nom a l’àrea de text i al desplegable', () => {
    render(
      <>
        <Field label="Descripció">
          <textarea className={INPUT} />
        </Field>
        <Field label="Tipus">
          <select className={INPUT}>
            <option>a</option>
          </select>
        </Field>
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'Descripció' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Tipus' })).toBeInTheDocument()
  })

  it('respecta el nom que el camp ja porta', () => {
    render(
      <Field label="Nom">
        <input aria-label="Nom complet" />
      </Field>,
    )
    expect(screen.getByRole('textbox', { name: 'Nom complet' })).toBeInTheDocument()
  })

  it('dona nom a un control amb id però sense cap label que hi apunti', () => {
    render(
      <Field label="Clau">
        <input id="clau" />
      </Field>,
    )
    expect(screen.getByRole('textbox', { name: 'Clau' })).toBeInTheDocument()
  })

  it('dona nom a cada un dels controls fills directes del camp', () => {
    render(
      <Field label="Punts">
        <input aria-label="Mínim" />
        <input />
        <input />
      </Field>,
    )
    expect(screen.getByRole('textbox', { name: 'Mínim' })).toBeInTheDocument()
    expect(screen.getAllByRole('textbox', { name: 'Punts' })).toHaveLength(2)
  })

  it('no cobreix un control dins d’un div: ha de portar el seu nom', () => {
    render(
      <Field label="Nom">
        <div>
          <input />
        </div>
      </Field>,
    )
    expect(screen.queryByRole('textbox', { name: 'Nom' })).toBeNull()
  })

  it('no toca els botons d’un grup', () => {
    render(
      <Field label="Abast">
        <button type="button">Tots</button>
        <button type="button">Junta</button>
      </Field>,
    )
    expect(screen.getByRole('group', { name: 'Abast' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tots' })).toBeInTheDocument()
  })

  it('el camp no apaga el contorn de focus', () => {
    expect(INPUT).not.toMatch(/(^|\s)outline-none(\s|$)/)
  })
})
