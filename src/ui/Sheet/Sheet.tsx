import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Un full que puja de baix.
 *
 * El primer d'aquesta app, i el va demanar la fase 3 per duplicat: el detall
 * d'una insígnia i la denúncia d'una foto són el mateix gest —una cosa que
 * s'obre sobre el que estaves mirant, sense marxar-ne— i fer-los dos cops seria
 * fer dues vegades la part difícil, que no és el dibuix.
 *
 * La part difícil és que un diàleg deixi de ser una capa i passi a ser un
 * diàleg: que Escape el tanqui, que el tabulador no se'n vagi a passejar per la
 * pantalla de sota, que el fons no faci scroll sota el dit, i que el focus torni
 * al botó que el va obrir. Res d'això es veu a cap disseny i tot es nota quan
 * falta.
 *
 * NO ÉS UN `<dialog>`. L'element natiu porta tot això de sèrie, però el seu
 * `::backdrop` i el seu top-layer es pinten per sobre de tot i no hi ha manera
 * d'ancorar-lo a la columna de 430 px de l'app: en una finestra ampla, el full
 * sortiria a mitja pantalla en comptes de sota el telèfon dibuixat.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

export function Sheet({
  label,
  onClose,
  children,
}: {
  /** Què és, per a qui no el veu. */
  readonly label: string
  readonly onClose: () => void
  readonly children: React.ReactNode
}) {
  const { t } = useTranslation()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'

    // El primer element que es pot enfocar, i si no n'hi ha cap, el panell.
    // Sense això el focus es queda al botó de sota i el teclat segueix parlant
    // amb una pantalla que ja no es veu.
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel.current)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || panel.current === null) return

      // La trampa. Sense ella, tabular surt del full i recorre la pantalla de
      // sota sense que es vegi res moure's.
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items[items.length - 1]
      if (first === undefined || last === undefined) return

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      root.style.overflow = before
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 mx-auto flex max-w-[var(--ds-shell-max-w)] flex-col justify-end"
    >
      {/* El vel. És un botó perquè tocar fora tanqui, i té text perquè un lector
          de pantalla pugui dir què fa en comptes de trobar-se un div que menja
          tocs. */}
      <button
        type="button"
        onClick={onClose}
        aria-label={t('actions.close')}
        className="absolute inset-0 bg-[var(--ds-scrim-bar)] backdrop-blur-[2px]"
      />
      <div
        ref={panel}
        tabIndex={-1}
        className="relative max-h-[85dvh] overflow-y-auto rounded-t-card border-t border-border-strong bg-surface-2 px-10 pt-9 pb-[calc(var(--ds-safe-bottom)+28px)]"
      >
        {children}
      </div>
    </div>
  )
}

/** El botó de tancar de la cantonada, 44 px com tots els de l'app. */
export function SheetClose({ onClose }: { readonly onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={t('actions.close')}
      className="grid size-[44px] place-items-center text-xl text-fg-muted"
    >
      ✕
    </button>
  )
}
