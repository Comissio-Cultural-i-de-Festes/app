import { useEffect, useState } from 'react'

import { inAppBrowser, isIos, isStandalone } from '@/lib/platform'

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

/**
 * El diàleg concret que encara es pot obrir. Es gasta en obrir-lo.
 *
 * Va separat d'`everOffered` a posta: si la branca de la pantalla es tria amb
 * això, descartar el diàleg i tornar-hi ensenya a un Android els dos passos del
 * Safari i l'avís de tornar a entrar, cap dels dos cert al seu mòbil. Una cosa
 * que es consumeix no pot decidir qui ets.
 */
let deferred: InstallPromptEvent | null = null

/** Que aquest navegador n'ha ofert un. No l'esborra ningú. */
let everOffered = false

const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    everOffered = true
    for (const notify of listeners) notify()
  })
}

/** Que el navegador ens ha donat un diàleg, i que encara no s'ha obert. */
export function hasNativeInstallPrompt(): boolean {
  return deferred !== null
}

/** Que aquest navegador instal·la apps, encara que el diàleg ja s'hagi gastat. */
export function offersNativeInstall(): boolean {
  return everOffered
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
 *
 * Llegeix `offersNativeInstall()` i no `hasNativeInstallPrompt()`: la branca ha
 * de dir quin navegador és, no si en aquest instant queda diàleg per obrir.
 */
export function useNativeInstallPrompt(): boolean {
  const [offers, setOffers] = useState(offersNativeInstall)

  useEffect(
    () =>
      onNativeInstallPrompt(() => {
        setOffers(offersNativeInstall())
      }),
    [],
  )

  return offers
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
 *
 * Dins del navegador integrat d'Instagram o Facebook, mai: els passos parlen
 * del Safari i allà no n'hi ha. La porta ja hi diu què fer.
 *
 * A l'iPhone, tampoc si l'enllaç porta una invitació. El codi només viu a la
 * URL, la icona obre l'arrel (`start_url: '/'`) i el seu magatzem no veu res
 * del Safari: instal·lar primer era perdre el codi i entrar com a pendent. Amb
 * codi, doncs, la porta va primer i el bescanvi es fa aquí mateix, al Safari;
 * el compte queda actiu al servidor, i a la icona n'hi ha prou d'entrar un cop
 * més amb Google. La instal·lació torna a l'Inici, com a targeta.
 *
 * L'opció descartada era desar el codi i recuperar-lo a la icona. No hi ha on:
 * cap dels dos magatzems veu l'altre, i demanar a algú que el torni a enganxar
 * és exactament el pas que es perdia.
 *
 * A Android no canvia res. Instal·lar no hi canvia de magatzem i la pestanya es
 * queda amb la URL sencera, codi inclòs.
 */
export function shouldPromptInstall(
  now = Date.now(),
  { invited = false }: { readonly invited?: boolean } = {},
): boolean {
  if (inAppBrowser() !== null) return false
  if (!isIos() && !hasNativeInstallPrompt()) return false
  if (isIos() && invited) return false
  if (isStandalone()) return false
  return now >= readSnooze()
}

/**
 * La mateixa oferta, a l'Inici i amb la sessió ja oberta.
 *
 * Només a l'iPhone i al Safari: és on hi ha passos a explicar i on qui ha entrat
 * amb una invitació no ha vist la pantalla. A Android el navegador té el seu
 * diàleg i la seva entrada de menú, i des de la icona no hi ha res a demanar.
 *
 * Comparteix el repòs amb la pantalla, a posta: «ara no» i «ja ho tinc fet» són
 * respostes a la pregunta, no a la forma que tenia.
 *
 * Tampoc mentre el codi de l'enllaç espera el bescanvi: instal·lar llavors és
 * obrir la icona sense codi i encara pendent, el forat que la porta davant de la
 * instal·lació tapava.
 */
export function shouldOfferInstallCard(
  now = Date.now(),
  { invited = false }: { readonly invited?: boolean } = {},
): boolean {
  if (invited) return false
  if (inAppBrowser() !== null) return false
  if (!isIos()) return false
  if (isStandalone()) return false
  return now >= readSnooze()
}
