import { Button, ButtonGroup } from 'app-comi'

/** The three answers to "hi véns?", which is what this row was drawn for. */
export function YesMaybeNo() {
  return (
    <div className="w-[358px]">
      <ButtonGroup>
        <Button>Sí</Button>
        <Button variant="secondary">Potser</Button>
        <Button variant="secondary">No</Button>
      </ButtonGroup>
    </div>
  )
}

/**
 * The reason the group exists: `items-stretch` makes every button as tall as
 * the tallest, so a label that wraps to two lines does not leave the row
 * ragged. Take the grid away and this is what breaks first.
 */
export function OneLabelWrapsAllMatch() {
  return (
    <div className="w-[358px]">
      <ButtonGroup>
        <Button>Sí</Button>
        <Button variant="secondary">Potser hi vaig</Button>
        <Button variant="secondary">No</Button>
      </ButtonGroup>
    </div>
  )
}

/** Two columns, for the point reasons at the door. */
export function TwoUp() {
  return (
    <div className="w-[358px]">
      <ButtonGroup>
        <Button variant="secondary">Hi ha ajudat</Button>
        <Button variant="secondary">Ha portat cotxe</Button>
      </ButtonGroup>
    </div>
  )
}
