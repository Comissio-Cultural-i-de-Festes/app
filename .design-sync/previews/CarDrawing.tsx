import { CarDrawing } from 'app-comi'

/**
 * A list of names says who is going; this says who is going with whom, which
 * is the thing people want to know before a two-hour drive.
 *
 * The geometry is fixed at five slots — driver plus four seats — so the block
 * is always 390 wide and 244 tall. Cells are phone width for that reason.
 */
const FACE = (hue: number) =>
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' fill='hsl(${String(hue)} 45%25 42%25)'/%3E%3Ccircle cx='48' cy='37' r='17' fill='%23f2ded0'/%3E%3Cpath d='M14 96c0-20 15-32 34-32s34 12 34 32z' fill='%23f2ded0'/%3E%3C/svg%3E`

function seat(
  id: string,
  nombre: string,
  hue: number,
  estat: 'a_dins' | 'convidat',
  minute: string,
) {
  return {
    user_id: id,
    created_at: `2026-09-12T20:${minute}:00.000Z`,
    estat,
    profiles: { nombre, avatar_url: FACE(hue) },
  }
}

function ride(seats: readonly unknown[], places = 4) {
  return {
    id: 'r-1',
    event_id: 'ev-1',
    driver_id: 'u-driver',
    sentit: 'anada',
    origen: 'Mataró Nord',
    hora_sortida: '20:30',
    places,
    notes: null,
    created_at: '2026-09-12T19:00:00.000Z',
    driver: { nombre: 'Marta', avatar_url: FACE(18) },
    seats,
  } as never
}

function Screen({ children }: { readonly children: React.ReactNode }) {
  return <div className="w-[390px] px-[var(--ds-gutter)]">{children}</div>
}

/** Two aboard, two seats still free — the dashed circles are the free ones. */
export function TwoAboard() {
  return (
    <Screen>
      <CarDrawing
        ride={ride([
          seat('u-1', 'Jordi', 145, 'a_dins', '10'),
          seat('u-2', 'Nil', 250, 'a_dins', '25'),
        ])}
        meId="u-me"
      />
    </Screen>
  )
}

/** Nobody yet: the driver alone, and four places to fill. */
export function EmptyCar() {
  return (
    <Screen>
      <CarDrawing ride={ride([])} meId="u-me" />
    </Screen>
  )
}

/** Full. No dashed circles at all — four of them would read as four people missing. */
export function Full() {
  return (
    <Screen>
      <CarDrawing
        ride={ride([
          seat('u-1', 'Jordi', 145, 'a_dins', '10'),
          seat('u-2', 'Nil', 250, 'a_dins', '25'),
          seat('u-3', 'Aina', 320, 'a_dins', '31'),
          seat('u-4', 'Pau', 90, 'a_dins', '42'),
        ])}
        meId="u-me"
      />
    </Screen>
  )
}

/**
 * A held seat is dimmed and labelled: somebody is keeping it, and nobody has
 * said that person is coming.
 */
export function WithAHeldSeat() {
  return (
    <Screen>
      <CarDrawing
        ride={ride([
          seat('u-1', 'Jordi', 145, 'a_dins', '10'),
          seat('u-2', 'Aina', 320, 'convidat', '25'),
        ])}
        meId="u-me"
      />
    </Screen>
  )
}

/** Your own bubble is ringed and its name takes the brand colour. */
export function YouAreInIt() {
  return (
    <Screen>
      <CarDrawing
        ride={ride([
          seat('u-1', 'Jordi', 145, 'a_dins', '10'),
          seat('u-me', 'Tu', 200, 'a_dins', '25'),
        ])}
        meId="u-me"
      />
    </Screen>
  )
}
