import { TextField } from 'app-comi'

/** Empty, showing the placeholder in the faint weight. */
export function Empty() {
  return (
    <div className="w-[358px]">
      <TextField id="p-email" label="El teu correu" type="email" placeholder="tu@exemple.cat" />
    </div>
  )
}

/** Filled: the value is the display-weight line under the uppercase label. */
export function Filled() {
  return (
    <div className="w-[358px]">
      <TextField
        id="p-email-2"
        label="El teu correu"
        type="email"
        defaultValue="marta@tecnocampus.cat"
      />
    </div>
  )
}

/** The six-digit code from the email, spaced out. */
export function CodeFromTheEmail() {
  return (
    <div className="w-[358px]">
      <TextField
        id="p-code"
        label="Codi del correu"
        inputMode="numeric"
        autoComplete="one-time-code"
        defaultValue="482 913"
      />
    </div>
  )
}

/** A form of them, which is how the ride offer screen reads. */
export function AForm() {
  return (
    <div className="flex w-[358px] flex-col gap-4">
      <TextField id="p-from" label="D'on surts" defaultValue="Mataró Nord" />
      <TextField id="p-at" label="A quina hora" type="time" defaultValue="20:30" />
      <TextField id="p-notes" label="Alguna cosa més" placeholder="Quatre paraules" />
    </div>
  )
}
