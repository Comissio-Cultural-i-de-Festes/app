import { brand } from '@/config/brand'

/**
 * The mark and the wordmark.
 *
 * Both are drawn from `VITE_APP_SHORT_NAME`, so a fork changes the brand by
 * editing configuration and never this file. The full stop at the end of the
 * name — "comi." — is the one piece of styling with meaning: it is set as a
 * disc rather than a glyph, in white inside the mark and in brand red beside
 * the wordmark. A short name without a full stop simply gets no disc, which is
 * the right answer for an association whose name does not have one.
 *
 * Everything is proportional to one `size` prop, with the ratios taken from
 * the three sizes the prototype draws (36, 44 and 62 for the mark; 22, 26 and
 * 36 for the wordmark). A fixed set of sizes would have been simpler and would
 * have broken the first time a screen needed a fourth.
 */

interface Parts {
  readonly word: string
  readonly hasDot: boolean
}

function parts(name: string): Parts {
  const trimmed = name.trim()
  return trimmed.endsWith('.')
    ? { word: trimmed.slice(0, -1), hasDot: true }
    : { word: trimmed, hasDot: false }
}

/** Ratios of the mark's own size. */
const MARK = { radius: 0.225, font: 0.284, dot: 0.081, gap: 0.0275 } as const

/** Ratios of the wordmark's font size. */
const WORD = { dot: 0.31, gap: 0.18 } as const

export interface LogoProps {
  readonly size: number
  readonly className?: string
}

/** The red square: the app icon, and the badge next to the wordmark. */
export function LogoMark({ size, className = '' }: LogoProps) {
  const { word, hasDot } = parts(brand.shortName)

  return (
    <span
      // Decorative wherever it appears: the wordmark or a heading always names
      // the association next to it.
      aria-hidden="true"
      className={`flex flex-none items-center justify-center overflow-hidden bg-brand ${className}`}
      style={{ width: size, height: size, borderRadius: size * MARK.radius }}
    >
      <span className="flex items-end" style={{ gap: size * MARK.gap }}>
        <span
          className="font-display text-on-brand"
          style={{
            fontSize: size * MARK.font,
            lineHeight: 0.8,
            letterSpacing: '-0.075em',
          }}
        >
          {word}
        </span>
        {hasDot ? (
          <span
            className="rounded-full bg-[var(--ds-text-on-brand)]"
            style={{ width: size * MARK.dot, height: size * MARK.dot }}
          />
        ) : null}
      </span>
    </span>
  )
}

/** The name set large, with the full stop as a red disc. */
export function Wordmark({ size, className = '' }: LogoProps) {
  const { word, hasDot } = parts(brand.shortName)

  return (
    <span className={`flex items-end ${className}`} style={{ gap: size * WORD.gap }}>
      <span
        className="font-display text-fg"
        style={{ fontSize: size, lineHeight: 0.8, letterSpacing: '-0.055em' }}
      >
        {word}
      </span>
      {hasDot ? (
        <span
          className="rounded-full bg-brand-strong"
          style={{
            width: size * WORD.dot,
            height: size * WORD.dot,
            marginBottom: Math.max(1, Math.round(size * 0.04)),
          }}
        />
      ) : null}
    </span>
  )
}
