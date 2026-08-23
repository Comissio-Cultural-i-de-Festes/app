import { unwrap } from '@/lib/db'
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
