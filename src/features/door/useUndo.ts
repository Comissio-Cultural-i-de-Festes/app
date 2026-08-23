import { useCallback, useState } from 'react'

import { errorKey } from '@/lib/errors'

import { type DoorOutcome, undo, undoTargetOf } from './api'

/**
 * Taking back the last one, on either door screen.
 *
 * The state is tied to the outcome it belongs to rather than cleared by hand,
 * because the reset that matters is the one nobody remembers to write: a
 * second person going through while "fet enrere" is still on screen, which
 * would otherwise read as a statement about the new one.
 */
export type UndoState =
  | 'idle'
  | 'busy'
  /** Gone from the server. */
  | 'undone'
  /** Only a queue entry went; nothing had reached the server. */
  | 'dropped'
  | 'failed'

export interface Undo {
  readonly state: UndoState
  /** Null when there is nothing this outcome could take back. */
  readonly run: (() => void) | null
  readonly error: unknown
}

interface Record_ {
  readonly of: DoorOutcome
  readonly state: UndoState
  readonly error: unknown
}

export function useUndo(outcome: DoorOutcome | null, onUndone: () => void): Undo {
  const [record, setRecord] = useState<Record_ | null>(null)

  const run = useCallback(() => {
    if (outcome === null) return
    const target = undoTargetOf(outcome)
    if (target === null) return

    setRecord({ of: outcome, state: 'busy', error: null })
    void undo(target)
      .then(() => {
        // "dropped" and "undone" are not the same sentence. One says the
        // check-in never happened, the other that it did and has been
        // reversed, and at a door those lead somewhere different.
        setRecord({
          of: outcome,
          state: target.kind === 'queued' ? 'dropped' : 'undone',
          error: null,
        })
        onUndone()
      })
      .catch((error: unknown) => {
        setRecord({ of: outcome, state: 'failed', error })
      })
  }, [outcome, onUndone])

  const mine = record !== null && record.of === outcome ? record : null
  const state = mine?.state ?? 'idle'
  const undoable = outcome !== null && undoTargetOf(outcome) !== null

  return {
    state,
    // Still there while it works, so the button says "desfent" instead of
    // vanishing under the thumb that just pressed it. Gone once it is done,
    // because there is nothing left to take back.
    run: undoable && state !== 'undone' && state !== 'dropped' ? run : null,
    error: mine?.error ?? null,
  }
}

/**
 * The line under the verdict once somebody has pressed undo.
 *
 * Shared by both door screens because the distinction it draws is the same on
 * both and easy to lose: offline is not "it did not work", it is "we could not
 * ask", and only one of the two is worth trying again in five seconds.
 */
export function undoNoteKey(state: UndoState, error: unknown): string | null {
  if (state === 'undone') return 'door.undone'
  if (state === 'dropped') return 'door.undoneQueued'
  if (state === 'failed') return navigator.onLine ? 'door.undoFailed' : errorKey(error)
  return null
}
