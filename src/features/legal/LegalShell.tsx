import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

/**
 * El marc de les dues pantalles legals, i el que tenen en comú.
 *
 * ES LLEGEIXEN SENSE SESSIÓ, que és tota la gràcia: qui encara no ha entrat ha
 * de poder saber què li passarà a les seves dades abans de decidir entrar-hi.
 * Per això les seves rutes viuen davant del porter de `App.tsx` i no dins de
 * l'arbre de rutes de sempre.
 *
 * I PER AIXÒ EL BOTÓ D'ENRERE ÉS `navigate(-1)` I NO UNA RUTA. Des del perfil
 * s'ha de tornar al perfil, des de l'alta a l'alta i des de la porta a la
 * porta —i la porta no és cap ruta, o sigui que no hi ha cap `to` que hi
 * apunti—. L'historial sap tornar als tres llocs i nosaltres no.
 *
 * La capçalera no és `JuntaHeader` pel mateix motiu: aquella rep un `to`.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function LegalShell({
  title,
  lead,
  children,
}: {
  readonly title: string
  readonly lead: string
  readonly children: ReactNode
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <main className="min-h-dvh bg-app pb-[calc(var(--ds-safe-bottom)+40px)]">
      <div
        className={`sticky top-0 z-10 bg-app pt-[max(calc(var(--ds-safe-top)+4px),12px)] pb-4 ${GUTTER}`}
      >
        <button
          type="button"
          onClick={() => void navigate(-1)}
          className="-ml-2 min-h-[44px] px-2 text-md font-bold text-fg-secondary"
        >
          <span aria-hidden="true">‹ </span>
          {t('legal.back')}
        </button>
      </div>

      <div className={`pt-2 ${GUTTER}`}>
        <h1 className="display text-d-s leading-[0.95] tracking-[-0.045em] [text-wrap:balance]">
          {title}
        </h1>
        <p className="mt-5 text-lg text-fg-secondary [text-wrap:pretty]">{lead}</p>

        {/* A dalt i no en un peu de pàgina: qui llegeix això ha de saber què
            està llegint abans de creure-se'l, no després. */}
        <p className="mt-7 border-l-[3px] border-brand bg-surface-1 px-6 py-6 text-sm text-fg-secondary [text-wrap:pretty]">
          {t('legal.draft')}
        </p>
      </div>

      {children}
    </main>
  )
}

/**
 * Un apartat: el títol i els seus paràgrafs.
 *
 * Els paràgrafs arriben ja traduïts i no per clau, perquè la clau l'ha de
 * construir la pantalla amb el seu prefix escrit sencer. Si es construís aquí
 * —`t(\`${prefix}.${id}\`)`— el detector de claus mortes no veuria cap prefix
 * fix i donaria tot el document per inabastable.
 */
export function LegalSection({
  title,
  paragraphs,
}: {
  readonly title: string
  readonly paragraphs: readonly string[]
}) {
  return (
    <section className={`pt-9 ${GUTTER}`}>
      <h2 className="eyebrow text-fg-muted">{title}</h2>
      {paragraphs.map((text, i) => (
        <p
          key={text.slice(0, 24) + String(i)}
          className="mt-5 text-base leading-[1.45] text-fg-secondary [text-wrap:pretty]"
        >
          {text}
        </p>
      ))}
    </section>
  )
}
