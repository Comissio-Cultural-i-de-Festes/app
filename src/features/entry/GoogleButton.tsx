import type { ButtonHTMLAttributes } from 'react'

/**
 * The one decision on the screen.
 *
 * White with dark text, which is Google's requirement and not a style choice:
 * their guidelines allow their mark on a white or a dark button and nowhere
 * else, and a four-colour logo on brand red reads as noise anyway. So this is
 * the one button in the app that is not brand-filled, and the one that does
 * not use the display face — it is Google's control, sitting in our screen.
 *
 * Square and min-height like everything else that takes a decision here, so a
 * longer label in Spanish grows it instead of clipping.
 */

function GoogleMark() {
  return (
    <span aria-hidden className="flex flex-none items-center justify-center">
      <svg width="22" height="22" viewBox="0 0 18 18">
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
        'inline-flex min-h-[60px] w-full items-center justify-center gap-[13px] rounded-cta ' +
        'border-0 bg-google-bg px-[18px] py-4 text-google-fg ' +
        'text-lg font-bold tracking-[-0.01em] ' +
        'leading-[var(--ds-btn-leading)] text-center [text-wrap:balance] whitespace-normal ' +
        'cursor-pointer [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] ' +
        'transition-[filter,transform] duration-[var(--ds-dur-base)] ease-[var(--ds-ease)] ' +
        'hover:brightness-95 active:scale-[0.985] ' +
        'disabled:cursor-default disabled:opacity-45 disabled:active:scale-100'
      }
    >
      <GoogleMark />
      {children}
    </button>
  )
}
