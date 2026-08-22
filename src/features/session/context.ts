import { createContext } from 'react'

/**
 * The signed-in member's id.
 *
 * Null only above the gate. Everything under App's session check has one, and
 * useUserId() turns "no session" into a crash rather than a screen quietly
 * rendering somebody else's ranking row as yours.
 */
export const UserIdContext = createContext<string | null>(null)
