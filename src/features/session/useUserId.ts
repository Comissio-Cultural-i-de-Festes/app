import { useContext } from 'react'

import { UserIdContext } from './context'

export function useUserId(): string {
  const id = useContext(UserIdContext)
  if (id === null) {
    throw new Error('useUserId() was called outside the signed-in part of the tree.')
  }
  return id
}
