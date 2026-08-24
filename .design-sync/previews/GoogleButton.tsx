import { GoogleButton } from 'app-comi'

/**
 * The one button in the app that is not brand-filled. White with dark text is
 * Google's requirement, not a style choice — their mark is allowed on a white
 * or a dark button and nowhere else.
 */
export function Default() {
  return (
    <div className="w-[358px]">
      <GoogleButton>Entra amb Google</GoogleButton>
    </div>
  )
}

/** Disabled, while the round trip is in flight. */
export function Disabled() {
  return (
    <div className="w-[358px]">
      <GoogleButton disabled>Un segon…</GoogleButton>
    </div>
  )
}

/** On the invitation screen, which is the only place it appears. */
export function OnTheEntryScreen() {
  return (
    <div className="w-[358px]">
      <p className="eyebrow text-brand-accent">T&apos;han convidat</p>
      <h1 className="display mt-5 text-d-sm leading-[0.92] tracking-[-0.045em]">
        Algú del grup t&apos;ha passat l&apos;enllaç
      </h1>
      <p className="mt-6 mb-8 text-base text-fg-secondary [text-wrap:pretty]">
        Entra amb el teu compte de Google i ja ets dels nostres. Cap contrasenya nova.
      </p>
      <GoogleButton>Entra amb Google</GoogleButton>
      <p className="mt-5 text-[12.5px] text-fg-muted [text-wrap:pretty]">
        Del compte només agafem el nom, el correu i la foto.
      </p>
    </div>
  )
}
