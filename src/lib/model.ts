/**
 * The handful of enumerations the database enforces with CHECK constraints,
 * mirrored here so the screens can switch on them exhaustively.
 *
 * These are codes, never labels. `escola` is 'politecnica', and what a member
 * reads is a translation key — the schools have long official names, they are
 * different in each language, and one of them will be renamed by the
 * university before this app is retired.
 */

export const ESCOLES = ['politecnica', 'empresa', 'salut'] as const
export type Escola = (typeof ESCOLES)[number]

export type EventType = 'fiesta' | 'casa_rural' | 'actividad'

export type AttendanceState = 'si' | 'potser' | 'no' | 'espera' | 'asistio' | 'cancelado'

/** The three answers a member can give. The rest are set by the door or the junta. */
export const ANSWERS = ['si', 'potser', 'no'] as const
export type Answer = (typeof ANSWERS)[number]

export function isEscola(value: string | null): value is Escola {
  return value !== null && (ESCOLES as readonly string[]).includes(value)
}
