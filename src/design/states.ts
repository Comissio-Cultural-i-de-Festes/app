/**
 * How a check-in outcome is presented at the door.
 *
 * There is exactly one of these maps and everything that renders a scan result
 * reads it, so the rules below hold by construction rather than by discipline.
 *
 * THE ICON AND THE HAPTIC CARRY THE SIGNAL. The colour reinforces it.
 * At night, at low screen brightness, with a queue behind you, two warm hues
 * can read as the same colour — a cross and a double buzz cannot. That is why
 * `icon` comes first in every entry and why the test asserts icons are unique
 * before it asserts anything about colour.
 *
 * THE BRAND RED IS NEVER A STATE. The association's colour is red and red is
 * the default failure colour in every interface, so if both were true the
 * scanner would be ambiguous in the half-second you get to read it. Failure is
 * amber, orange or violet here. Enforced by states.test.ts.
 */

/** What `public.check_in()` returns. Mirrors the SQL discriminant exactly. */
export type CheckInStatus =
  /** Registered, first scan. Points awarded. */
  | 'ok'
  /** Not on the list, but the event is free and unlimited, so they just walk in. */
  | 'ok_walkin'
  /** Not on the list at an event with limited places or a price. Admitted —
   *  blocking at a door is worse than a row to reconcile on Monday — but the
   *  junta has to see that this person was neither signed up nor paid. */
  | 'ok_walkin_review'
  /** This QR already went through for this event. No second award. */
  | 'already_checked_in'
  /** The token resolves to nobody. */
  | 'not_a_member'
  /** A real member whose account is pending approval or deactivated. */
  | 'member_inactive'
  /** Unpublished event, or the scanner is pointed at the wrong one. */
  | 'event_not_open'
  /** Network or server fault. Not a verdict about the person. */
  | 'error'

/** Design-token names, without the `--ds-` prefix. */
export type StateTone = 'success' | 'warning' | 'unknown' | 'error'

export type ScanIcon =
  'check' | 'check-plus' | 'check-alert' | 'cross' | 'question' | 'pause' | 'lock' | 'alert'

/** Milliseconds for `navigator.vibrate`: on, off, on … */
export type HapticPattern = readonly number[]

export const HAPTIC = {
  short: [40],
  double: [40, 60, 40],
  long: [180],
} as const satisfies Record<string, HapticPattern>

export interface ScanPresentation {
  /** Primary signal. Unique across every status. */
  readonly icon: ScanIcon
  /** Secondary signal, for when the screen is not being looked at. */
  readonly haptic: HapticPattern
  /** Reinforcement only. Never the brand. */
  readonly tone: StateTone
  /** Whether the person got through the door. */
  readonly admitted: boolean
  /** i18n key for the headline shown on the feedback card. */
  readonly messageKey: string
  /**
   * i18n key for the line under it: what the person holding the phone should
   * do now, or null where there is nothing to do — the ordinary yes, whose
   * detail line already carries the school and the points.
   *
   * A verdict without one is a statement at somebody standing in a doorway
   * with a queue behind them, which is exactly what the brief rules out for
   * the door.
   */
  readonly actionKey: string | null
}

export const SCAN_PRESENTATION = {
  ok: {
    icon: 'check',
    haptic: HAPTIC.short,
    tone: 'success',
    admitted: true,
    messageKey: 'scanner.ok',
    actionKey: null,
  },
  ok_walkin: {
    icon: 'check-plus',
    haptic: HAPTIC.short,
    tone: 'success',
    admitted: true,
    messageKey: 'scanner.okWalkin',
    actionKey: 'scanner.action.okWalkin',
  },
  ok_walkin_review: {
    icon: 'check-alert',
    haptic: HAPTIC.double,
    tone: 'warning',
    admitted: true,
    messageKey: 'scanner.okWalkinReview',
    actionKey: 'scanner.action.okWalkinReview',
  },
  already_checked_in: {
    icon: 'cross',
    // Long, not double. `ok_walkin_review` is also warning-toned and was also
    // a double buzz, so the one signal meant to work without looking said the
    // same thing for "they are in" and "they are not".
    haptic: HAPTIC.long,
    tone: 'warning',
    admitted: false,
    messageKey: 'scanner.alreadyCheckedIn',
    actionKey: 'scanner.action.alreadyCheckedIn',
  },
  not_a_member: {
    icon: 'question',
    haptic: HAPTIC.long,
    tone: 'unknown',
    admitted: false,
    messageKey: 'scanner.notAMember',
    actionKey: 'scanner.action.notAMember',
  },
  member_inactive: {
    icon: 'pause',
    haptic: HAPTIC.long,
    tone: 'unknown',
    admitted: false,
    messageKey: 'scanner.memberInactive',
    actionKey: 'scanner.action.memberInactive',
  },
  event_not_open: {
    icon: 'lock',
    haptic: HAPTIC.long,
    tone: 'error',
    admitted: false,
    messageKey: 'scanner.eventNotOpen',
    actionKey: 'scanner.action.eventNotOpen',
  },
  error: {
    icon: 'alert',
    haptic: HAPTIC.double,
    tone: 'error',
    admitted: false,
    messageKey: 'scanner.error',
    actionKey: 'scanner.action.error',
  },
} as const satisfies Record<CheckInStatus, ScanPresentation>

/** The CSS variable a tone resolves to. */
export const toneVar = (tone: StateTone): string => `var(--ds-${tone})`

/**
 * How a member's warnings step is drawn: the chip on the member list, on their
 * record and on the junta's front door.
 *
 * THE SAME FOUR TONES AS THE DOOR, and for the same reason: the brand red is
 * the association, not a verdict, and a list where a red chip might mean "at
 * risk" or might mean "one of ours" is a list nobody can read at a glance.
 * `risc` is the orange `error`, `expulsio` the violet `unknown`. Violet for the
 * last step is deliberate: "expulsion to a vote" is a decision nobody has taken
 * yet, which is exactly what that tone means at the door.
 *
 * `filled` IS WHAT MAKES THE LAST STEP READ AS THE WORST, not the hue. Hue order
 * means nothing to someone who cannot separate warm colours; a solid chip next
 * to three outlined ones reads as heavier in greyscale too. Only one step is
 * filled, and states.test.ts holds that.
 *
 * `ok` is green and outlined, and only ever drawn next to somebody who has live
 * warnings: a green chip beside every name would turn the member list into a
 * register of everybody.
 */
export const ESTAT_AVIS_PRESENTATION = {
  ok: { tone: 'success', filled: false },
  avis: { tone: 'warning', filled: false },
  risc: { tone: 'error', filled: false },
  expulsio: { tone: 'unknown', filled: true },
} as const satisfies Record<
  'ok' | 'avis' | 'risc' | 'expulsio',
  { readonly tone: StateTone; readonly filled: boolean }
>
