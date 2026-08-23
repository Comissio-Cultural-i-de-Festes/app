import { unwrap, unwrapAs } from '@/lib/db'
import type { Escola } from '@/lib/model'
import { supabase } from '@/lib/supabase'

/**
 * The four first-run answers.
 *
 * Two statements, not one, because the phone number lives in a different table
 * from everything else — `profile_contact`, alongside the email the provider
 * gave us, so that `select('*')` on `profiles` can be handed to any member
 * without leaking anybody's number.
 */

export interface Degree {
  readonly id: string
  readonly nom: string
}

export const onboardingKeys = {
  degrees: (escola: Escola | null) => ['onboarding', 'degrees', escola] as const,
  /** Every school's list at once, for invalidating after the junta edits one. */
  allDegrees: () => ['onboarding', 'degrees'] as const,
}

/**
 * The degrees on offer at one school.
 *
 * From the database rather than a constant in here: the list belongs to a
 * university and not to this app, it changes when the university opens a
 * programme, and the junta can edit it without a deploy. Readable by a profile
 * that is still pending, which is exactly who is looking at this screen.
 */
export async function fetchDegrees(escola: Escola): Promise<Degree[]> {
  return unwrapAs<Degree[]>(
    supabase.from('graus').select('id, nom').eq('escola', escola).order('ordre').order('nom'),
  )
}

export interface FirstRunAnswers {
  readonly escola: Escola
  readonly grau: string | null
  readonly curs: number | null
  readonly telefon: string | null
}

export async function saveFirstRun(userId: string, answers: FirstRunAnswers): Promise<void> {
  await unwrap(
    supabase
      .from('profiles')
      .update({ escola: answers.escola, grau: answers.grau, curs: answers.curs })
      .eq('id', userId)
      .select('id'),
  )

  // `update`, never `upsert`. There is no INSERT grant on profile_contact by
  // design, and the row is guaranteed to exist because the trigger on
  // auth.users creates it — an upsert would be refused for a reason that has
  // nothing to do with what went wrong.
  await unwrap(
    supabase
      .from('profile_contact')
      .update({ telefon: answers.telefon })
      .eq('id', userId)
      .select('id'),
  )
}

/**
 * A phone number as somebody types it, kept as they typed it.
 *
 * No normalising and no country logic: the junta reads these to find people in
 * a WhatsApp group, not to dial them from software, and a number mangled into
 * E.164 by a guess about the country is worse than one with spaces in it. Only
 * the obvious rubbish is refused.
 */
export function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 9 && digits.length <= 15
}
