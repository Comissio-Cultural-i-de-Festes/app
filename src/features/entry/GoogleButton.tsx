import type { ButtonHTMLAttributes } from 'react'

/**
 * The one decision on the screen.
 *
 * Same shape as the prototype's ENTRA — square, brand-filled, the display
 * face, min-height so a longer label in Spanish grows it rather than clipping.
 * The mark sits inside on a white tile because Google's brand guidelines ask
 * for it on white, and because a coloured logo on brand red reads as noise.
 */

function GoogleMark() {
  return (
    <span
      aria-hidden
      className="flex size-[28px] flex-none items-center justify-center rounded-xs bg-white"
    >
      <svg width="18" height="18" viewBox="0 0 18 18">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
        />
        <path
          fill="#FBBC05"
          d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
        />
      </svg>
    </span>
  )
}

export function GoogleButton({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={
        'inline-flex w-full min-h-[60px] items-center justify-center gap-3 rounded-cta border-0 ' +
        'bg-brand-cta px-[var(--ds-btn-pad-x)] py-[var(--ds-btn-pad-y)] text-on-brand ' +
        'font-display text-[24px] tracking-[-0.035em] uppercase ' +
        'leading-[var(--ds-btn-leading)] text-center [text-wrap:balance] whitespace-normal ' +
        'cursor-pointer [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] ' +
        'transition-[background-color,transform] duration-[var(--ds-dur-base)] ease-[var(--ds-ease)] ' +
        'hover:bg-[var(--ds-brand-hover)] active:scale-[0.985] ' +
        'disabled:cursor-default disabled:opacity-45 disabled:active:scale-100'
      }
    >
      <GoogleMark />
      {children}
    </button>
  )
}
