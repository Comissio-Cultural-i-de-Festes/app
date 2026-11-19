import { useQueryClient } from '@tanstack/react-query'
import { Component, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { type JuntaHomeData, juntaHomeKeys } from '@/features/junta/homeApi'
import { JuntaStringsUnavailable, juntaStrings } from '@/i18n/junta'

import { isMissingChunk } from './missingChunk'

/**
 * Una pantalla de junta que no és al mòbil, sense xarxa.
 *
 * Les pantalles d'escriptori de la junta no són a la precache
 * (`build/precache.ts`). Amb el rebedor obert a la porta i sense cobertura,
 * tocar «3 no pagats» demana un tros que no hi és. Sense això, l'error pujava
 * fins a l'`ErrorBoundary` de sota tota l'app, que recarregava: la pàgina nova
 * no tenia el perfil, la zona de junta es tancava, i a l'iPhone el camí a
 * l'escàner desapareixia fins que tornés la cobertura.
 *
 * Aquí es queda dins de la zona: es diu que aquella pantalla necessita xarxa, i
 * es dona el camí de tornada al rebedor i, si se sap quin és, a l'escàner de la
 * porta d'avui. Sense recarregar res.
 *
 * Només per a aquest cas. Qualsevol altre error —o el mateix amb xarxa, que és
 * el d'un desplegament— es torna a llançar, i el resol la xarxa de sota com
 * sempre.
 *
 * ELS TEXTOS DE LA JUNTA, en canvi, sempre acaben aquí, amb xarxa o sense
 * (`src/i18n/junta.ts`). Amb una wifi connectada que no dona internet,
 * `navigator.onLine` diu que sí: recarregar no portava res, i la xarxa de sota
 * acabava anunciant una versió nova que no existia. La fallada s'oblida en
 * ensenyar-la, perquè la pantalla següent que s'obri ho torni a provar.
 *
 * Es munta amb la ruta com a `key`, i per això tornar al rebedor el reinicia.
 * Un `lazy()` que ha fallat queda fallat fins que es recarrega la pàgina: si es
 * torna a tocar la mateixa pantalla quan ja hi ha xarxa, l'error puja i la
 * xarxa de sota recarrega un cop, que és el que toca.
 */

interface State {
  readonly error: { readonly value: unknown } | null
}

export class JuntaScreenBoundary extends Component<{ readonly children: ReactNode }, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error: { value: error } }
  }

  override componentDidCatch(error: unknown): void {
    if (error instanceof JuntaStringsUnavailable) juntaStrings.forgetFailures()
  }

  override render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children
    if (error.value instanceof JuntaStringsUnavailable) return <NeedsSignal />
    if (!isMissingChunk(error.value) || navigator.onLine) throw error.value
    return <NeedsSignal />
  }
}

function NeedsSignal() {
  const { t } = useTranslation()
  // El que el rebedor ja sabia, si l'ha pogut llegir: amb la memòria i prou,
  // perquè sense xarxa no hi ha res més a preguntar.
  const porta = useQueryClient().getQueryData<JuntaHomeData>(juntaHomeKeys.home())?.porta ?? null

  return (
    <main className="flex min-h-dvh flex-col justify-center gap-6 bg-app px-[var(--ds-gutter)]">
      <p role="alert" className="text-lg font-bold text-error [text-wrap:pretty]">
        {t('junta.needsSignalTitle')}
      </p>
      <p className="text-base text-fg-secondary [text-wrap:pretty]">{t('junta.needsSignalBody')}</p>
      {porta === null ? null : (
        <Link
          to={`/junta/escaner/${porta.id}`}
          className="flex min-h-[62px] items-center justify-center bg-brand-cta px-6 text-xl font-bold text-on-brand no-underline [text-wrap:balance]"
        >
          {t('junta.scan')}
        </Link>
      )}
      <Link
        to="/junta"
        className="flex min-h-[44px] items-center justify-center px-4 text-md font-bold text-brand-label no-underline [text-wrap:balance]"
      >
        {t('junta.needsSignalBack')}
      </Link>
    </main>
  )
}
