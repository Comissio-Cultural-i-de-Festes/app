import { Component, type ErrorInfo, type ReactNode } from 'react'

import i18n from '@/i18n'

import { isMissingChunk } from './missingChunk'

/**
 * L'única xarxa que hi ha sota tota l'app.
 *
 * PER QUÈ ARA I NO ABANS. Fins que la zona de junta es va partir en vint trossos
 * carregats a demanda, cap pantalla necessitava la xarxa per a pintar-se: un
 * error de render era un defecte, i un defecte es veia en desenvolupament.
 * Amb `lazy()` n'hi ha un que NO és un defecte i que només passa en producció:
 * el tros que falta.
 *
 * COM PASSA, i és el dia del desplegament. `vite.config.ts` fa `skipWaiting` i
 * `clientsClaim`, i `registerSW({ immediate: true })` no pregunta res. Quan
 * puges una versió, el service worker nou s'activa sobre una pestanya oberta
 * que encara executa el `index-<hash>.js` vell, i els trossos vells ja no són
 * ni a la precaché ni al desplegament de Cloudflare. Aleshores algú de la junta
 * prem «Escàner» a la porta, l'import es rebutja, React torna a llançar durant
 * el render i, sense això, l'app es queda en blanc a mitja festa.
 *
 * UNA RECÀRREGA I NOMÉS UNA. Per al tros que falta, recarregar és l'arreglo de
 * debò: la pàgina nova demana el `index-<hash>` nou i els noms de tros nous.
 * Es fa sola perquè a la porta ningú no llegeix un missatge, i es fa un sol cop
 * —amb una marca a `sessionStorage`— perquè si el motiu no era un desplegament
 * sinó que no hi ha cobertura, recarregar en bucle és pitjor que dir-ho.
 *
 * I MAI SENSE XARXA. Aleshores el tros no ha arribat perquè no hi ha cobertura,
 * i la recàrrega no el portaria: només perdria el que hi ha a la memòria. A la
 * porta, això és el perfil, i sense perfil la zona de junta es tanca i el camí
 * a l'escàner desapareix. Sense xarxa es diu, i es torna a provar a mà.
 *
 * NO SUBSTITUEIX `errorKey()`. Això és per al que no s'havia previst; una RPC
 * que respon 403 segueix sent una frase a la pantalla i no una caiguda.
 */

const RELOADED = 'comi.chunk.reloaded'

interface State {
  readonly failed: boolean
  readonly stale: boolean
  readonly offline: boolean
}

export class ErrorBoundary extends Component<{ readonly children: ReactNode }, State> {
  override state: State = { failed: false, stale: false, offline: false }

  static getDerivedStateFromError(error: unknown): State {
    const missing = isMissingChunk(error)
    return { failed: true, stale: missing, offline: missing && !navigator.onLine }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // A la consola i enlloc més: no hi ha cap servei on enviar-ho, i muntar-ne
    // un per a això voldria dir un tercer més a la política de privadesa.
    console.error('[comi] render error', error, info.componentStack)

    if (isMissingChunk(error) && navigator.onLine && sessionStorage.getItem(RELOADED) === null) {
      sessionStorage.setItem(RELOADED, '1')
      window.location.reload()
    }
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children

    const { stale, offline } = this.state
    const title = i18n.t(
      offline ? 'crash.offlineTitle' : stale ? 'crash.staleTitle' : 'crash.title',
    )
    const body = i18n.t(offline ? 'crash.offlineBody' : stale ? 'crash.staleBody' : 'crash.body')

    return (
      <main className="flex min-h-dvh flex-col justify-center bg-app px-[var(--ds-gutter)]">
        <h1 className="display text-d-s leading-[0.95] tracking-[-0.045em] [text-wrap:balance]">
          {title}
        </h1>
        <p className="mt-5 text-base text-fg-secondary [text-wrap:pretty]">{body}</p>
        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem(RELOADED)
            window.location.reload()
          }}
          className="mt-9 min-h-[56px] w-full bg-brand-cta px-8 text-lg font-bold text-on-brand [text-wrap:balance]"
        >
          {offline ? i18n.t('actions.retry') : i18n.t('crash.reload')}
        </button>
      </main>
    )
  }
}
