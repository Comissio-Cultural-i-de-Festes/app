import { FieldShell } from 'app-comi'

/** The read-only invitation code, which is what the shell was drawn for. */
export function InvitationCode() {
  return (
    <div className="w-[358px]">
      <FieldShell label="Invitació">
        <p className="mt-[7px] text-xl font-semibold tracking-[0.12em] text-fg">7QK-24M</p>
      </FieldShell>
    </div>
  )
}

/** `aside` takes the right-hand side of the label row — here, the expiry. */
export function WithAnExpiry() {
  return (
    <div className="w-[358px]">
      <FieldShell
        label="Invitació"
        aside={
          <span className="text-2xs font-bold tracking-[0.08em] text-brand-accent uppercase">
            Caduca en 6 h
          </span>
        }
      >
        <p className="mt-[7px] text-xl font-semibold tracking-[0.12em] text-fg">7QK-24M</p>
      </FieldShell>
    </div>
  )
}

/**
 * Dashed stands for something absent. The "no invitation" panel on the door
 * has the shape of the invitation block precisely so the missing thing reads
 * as missing rather than as nothing.
 */
export function DashedForSomethingAbsent() {
  return (
    <div className="w-[358px]">
      <FieldShell
        label="Sense invitació"
        variant="dashed"
        aside={
          <span className="text-2xs font-bold tracking-[0.08em] text-fg-dim uppercase">
            Ho aprova la junta
          </span>
        }
      >
        <p className="mt-[7px] text-xl font-semibold text-fg-muted">Cap codi</p>
      </FieldShell>
    </div>
  )
}

/** Stacked, the way the invitation screen uses them. */
export function Stacked() {
  return (
    <div className="flex w-[358px] flex-col gap-4">
      <FieldShell
        label="Invitació"
        aside={
          <span className="text-2xs font-bold tracking-[0.08em] text-brand-accent uppercase">
            Caduca en 2 dies
          </span>
        }
      >
        <p className="mt-[7px] text-xl font-semibold tracking-[0.12em] text-fg">7QK-24M</p>
      </FieldShell>
      <FieldShell label="Sense invitació" variant="dashed">
        <p className="mt-[7px] text-xl font-semibold text-fg-muted">Cap codi</p>
      </FieldShell>
    </div>
  )
}
