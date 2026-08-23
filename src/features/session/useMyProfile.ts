import { useQuery } from '@tanstack/react-query'

import { type MyProfile, fetchProfile, profileKeys } from './profile'
import { useUserId } from './useUserId'

/**
 * Who is looking at the screen.
 *
 * Everything downstream of the door needs some of this — whether to show the
 * junta entrance, whether the sign-up button works, whether onboarding is
 * still owed — so it is one query with one key, shared by every caller through
 * the cache rather than fetched per screen.
 *
 * `role` and `estat` come from the row itself and not from the JWT on purpose.
 * A token issued before somebody was made an admin still says `member`, and a
 * token issued before somebody was removed still says `admin` until it
 * expires; the row is current the moment the change lands.
 */
export function useMyProfile() {
  const userId = useUserId()

  return useQuery({
    queryKey: profileKeys.me(userId),
    queryFn: () => fetchProfile(userId),
  })
}

export function isJunta(profile: MyProfile | null | undefined): boolean {
  return profile?.role === 'admin' || profile?.role === 'owner'
}

/**
 * Whether the first-run questions are still owed.
 *
 * The school is the one that matters: points go to a school, and somebody with
 * none is invisible in half the app. Grau, curs and the phone are useful and
 * can wait.
 */
export function needsOnboarding(profile: MyProfile | null | undefined): boolean {
  return profile?.escola === null
}
