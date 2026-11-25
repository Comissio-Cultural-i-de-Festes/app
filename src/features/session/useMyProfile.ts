import { useQuery } from '@tanstack/react-query'
import { type Access, accessOf } from './access'

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
    queryKey: profileKeys.of(userId),
    queryFn: () => fetchProfile(userId),
  })
}

/** El rellotge que comparteixen les portes que esperen el perfil: vegeu `useAvailability`. */
export const PROFILE_CLOCK = 'profile'

export function isJunta(profile: MyProfile | null | undefined): boolean {
  return profile?.role === 'admin' || profile?.role === 'owner'
}

/**
 * Whether the first-run questions are still owed.
 *
 * The school is the one that matters: points go to a school, and somebody who
 * has not said which is invisible in half the app. Grau, curs and the phone are
 * useful and can wait.
 *
 * "Said" is the word, not "has one". Somebody from outside the three schools
 * answers by marking themselves `extern`, and from then on a null school is an
 * answer and not a question still open (migració 96). Before that, the only way
 * through this door was to invent a school, and the invented one counted.
 */
export function needsOnboarding(profile: MyProfile | null | undefined): boolean {
  return profile?.escola === null && !profile.extern
}

/** `accessOf` sobre el perfil propi: el que els blocs consulten abans de pintar un recompte. */
export function useAccess(): Access {
  const { data: profile } = useMyProfile()
  return accessOf(profile)
}
