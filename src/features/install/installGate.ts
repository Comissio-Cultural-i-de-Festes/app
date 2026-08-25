import { useEffect, useState } from 'react'

import { isIos, isStandalone } from '@/lib/platform'

/**
 * When to show the install screen.
 *
 * The brief calls this the screen with the most effect on whether people end
 * up with the app at all, so it appears before signing in rather than after:
 * on iOS the home-screen app has its own storage, and telling somebody to
 * install after they have signed in means they tap the icon and find
 * themselves signed out.
 *
 * It is not a wall. Skipping it continues in Safari, with a one-line warning
 * that signing in again from the icon will be necessary. Blocking the door at
 * the October meeting would be worse than the problem it solves.
 */

const SNOOZE_KEY = 'comi.install.snoozedUntil'

const DAY_MS = 24 * 60 * 60 * 1000
/** "Not now" — long enough not to nag, short enough to catch them before the
 *  first event. */
export const SNOOZE_LATER_MS = 7 * DAY_MS
/** "Already done" — we cannot verify it from Safari, so take their word for a
 *  while. If it is true, the icon is standalone and never asks again anyway. */
export const SNOOZE_DONE_MS = 30 * DAY_MS

function readSnooze(): number {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY)
    const until = raw === null ? 0 : Number(raw)
    return Number.isFinite(until) ? until : 0
  } catch {
    // Private mode, or storage blocked. Not a reason to hide the screen.
    return 0
  }
}

export function snoozeInstall(forMs: number, now = Date.now()): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(now + forMs))
  } catch {
    // Nothing to do: the screen will simply come back next time.
  }
}

export function clearInstallSnooze(): void {
  try {
    localStorage.removeItem(SNOOZE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * El diàleg natiu d'instal·lació, quan el navegador l'ofereix.
 *
 * Android era la meitat del públic i no tenia cap camí: aquesta pantalla només
 * sortia a iOS, amb raó —els dos mock-ups són del Safari— però el resultat era
 * que a Android no sortia res, i el mini-infobar del Chrome es perd de seguida.
 *
 * `beforeinstallprompt` s'ha de capturar aviat i s'ha de guardar: el navegador
 * el dispara un cop, i `prompt()` només es pot cridar sobre l'esdeveniment
 * original. `preventDefault()` és el que amaga l'infobar del navegador perquè
 * el botó d'aquesta app sigui l'única oferta, en lloc de dues alhora.
 *
 * El listener es registra en importar el mòdul i no des d'un component:
 * l'esdeveniment arriba abans que React hagi muntat res.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    for (const notify of listeners) notify()
  })
}

/** Que el navegador ens ha donat un diàleg per oferir. */
export function hasNativeInstallPrompt(): boolean {
  return deferred !== null
}

/**
 * Avisa quan arriba. `shouldPromptInstall()` es llegeix un sol cop en muntar
 * l'app, i a Android l'esdeveniment sovint arriba després.
 */
export function onNativeInstallPrompt(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/**
 * El mateix, per a una pantalla que ha de canviar de branca a mig camí.
 *
 * Chrome dispara `beforeinstallprompt` quan li va bé —poc després de la
 * càrrega, i més tard encara amb connexió lenta, que és el supòsit de tota
 * aquesta app. Llegint-ho un sol cop al muntatge, un Android que arribi un
 * instant abans que l'esdeveniment es quedava mirant dos passos de la barra
 * del Safari i un avís de tornar a entrar, cap dels dos cert al seu mòbil,
 * amb el botó bo desat a la memòria.
 *
 * Mateix patró que `useOnline`: primera lectura a l'inicialitzador i la
 * subscripció a un efecte que es dona de baixa.
 */
export function useNativeInstallPrompt(): boolean {
  const [has, setHas] = useState(hasNativeInstallPrompt)

  useEffect(
    () =>
      onNativeInstallPrompt(() => {
        setHas(hasNativeInstallPrompt())
      }),
    [],
  )

  return has
}

/** `true` si l'ha acceptat. El diàleg només es pot obrir un cop. */
export async function promptNativeInstall(): Promise<boolean> {
  const event = deferred
  if (event === null) return false
  deferred = null
  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome === 'accepted'
}

/**
 * iOS sempre, perquè allà la instal·lació ha d'anar ABANS del login —l'app de
 * la pantalla d'inici té el seu propi magatzem— i el navegador no hi ofereix
 * cap diàleg. A la resta, només quan n'hi ha un: sense diàleg no hi ha res a
 * ensenyar que no siguin instruccions d'un altre navegador.
 */
export function shouldPromptInstall(now = Date.now()): boolean {
  if (!isIos() && !hasNativeInstallPrompt()) return false
  if (isStandalone()) return false
  return now >= readSnooze()
}
