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

/**
 * Els vuit estats que `attendances.estado` pot tenir de debò.
 *
 * `sollicitat` i `rebutjat` van arribar amb la migració 27 —els esdeveniments
 * que la junta ha d'aprovar— i aquest tipus es va quedar amb sis. La pantalla
 * de l'esdeveniment els comparava igualment, i només compilava perquè allà el
 * camp estava declarat `string`: el compilador no podia dir que faltaven.
 * L'ordre és el del CHECK de la base.
 */
export type AttendanceState =
  'si' | 'potser' | 'no' | 'espera' | 'asistio' | 'cancelado' | 'sollicitat' | 'rebutjat'

/**
 * Who can do what. `owner` is infrastructure and nothing else: an admin can
 * name other admins, so a committee can hand over in June without needing
 * anybody who knows what a database is.
 */
export type MemberRole = 'member' | 'admin' | 'owner'

/** The three answers a member can give. The rest are set by the door or the junta. */
export const ANSWERS = ['si', 'potser', 'no'] as const
export type Answer = (typeof ANSWERS)[number]
