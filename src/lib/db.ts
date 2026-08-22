import type { PostgrestError } from '@supabase/supabase-js'

/**
 * A PostgREST failure, as a thrown error.
 *
 * supabase-js returns `{ data, error }` rather than rejecting, which means a
 * forgotten `if (error)` reads as an empty result — a leaderboard with nobody
 * in it, a home screen with no events. Every query goes through here so a
 * failure is a failure and the screens can show it.
 */
export class DbError extends Error {
  readonly code: string

  constructor(error: PostgrestError) {
    super(error.message)
    this.name = 'DbError'
    this.code = error.code
  }
}

/**
 * Errors that will fail again in exactly the same way.
 *
 * Class 42 is privileges and undefined objects, 22 is bad input, 23 is a
 * constraint. PGRST1xx is PostgREST failing to parse the request. None of them
 * become true by waiting, and retrying them costs a member three seconds of
 * spinner before the same message appears.
 */
const PERMANENT = /^(?:42|22|23|PGRST1)/

export function isPermanent(error: unknown): boolean {
  return error instanceof DbError && PERMANENT.test(error.code)
}

interface Result<T> {
  data: T | null
  error: PostgrestError | null
}

/** For queries that must return something. A missing row is an error. */
export async function unwrap<T>(query: PromiseLike<Result<T>>): Promise<T> {
  const { data, error } = await query
  if (error) throw new DbError(error)
  if (data === null) throw new Error('The query succeeded and returned nothing.')
  return data
}

/** For `.maybeSingle()`, where no row is a legitimate answer. */
export async function unwrapMaybe<T>(query: PromiseLike<Result<T>>): Promise<T | null> {
  const { data, error } = await query
  if (error) throw new DbError(error)
  return data
}

/**
 * As `unwrap`, for the queries whose generated type is known to be wrong.
 *
 * The corrected shapes live in lib/schema.ts with the reason each one is
 * corrected. This is the one place the assertion happens, rather than an `as`
 * at every call site where nobody would read the reason.
 */
export async function unwrapAs<T>(query: PromiseLike<Result<unknown>>): Promise<T> {
  return (await unwrap(query)) as T
}
