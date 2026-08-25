import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDateTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { useModalFocus } from '@/ui/Modal/useModalFocus'

import { deletePhoto, type GalleryPhoto, galleryKeys } from './api'
import { ReportSheet } from './ReportSheet'

/**
 * Una foto, a tota pantalla.
 *
 * És l'únic lloc de la galeria on es baixa la foto de debò: la graella són
 * miniatures i prou, i aquesta és la meitat del disseny que fa que dues-centes
 * fotos siguin cinc megues i no trenta-sis.
 *
 * «Esborra-la» només surt a qui la va pujar i a la junta, i la base ho torna a
 * dir: la política d'esborrat no es fia d'aquest botó.
 */

/** El dit no va recte: menys que això és un scroll, no un gest. */
const SWIPE_PX = 40

// El vidre fosc és el mateix que la fletxa de tornar de l'esdeveniment: una
// glifa sola sobre una foto clara no es veu.
const ARROW =
  'absolute top-1/2 grid size-[44px] -translate-y-1/2 place-items-center rounded-full ' +
  'bg-[oklch(0.15_0.012_25/0.7)] text-2xl text-fg backdrop-blur-[6px] ' +
  'disabled:text-fg-faint-lo disabled:backdrop-blur-none'

export function Viewer({
  photos,
  index,
  urls,
  isAdmin,
  onClose,
}: {
  readonly photos: readonly GalleryPhoto[]
  readonly index: number
  readonly urls: Map<string, string>
  readonly isAdmin: boolean
  readonly onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const client = useQueryClient()
  const [at, setAt] = useState(index)
  const [reporting, setReporting] = useState(false)

  const photo = photos[at] ?? null

  const remove = useMutation({
    mutationFn: () => (photo === null ? Promise.resolve() : deletePhoto(photo)),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: galleryKeys.all() })
      onClose()
    },
  })

  // Escape, la trampa del tabulador, el scroll bloquejat i el retorn del focus:
  // el mateix que el Sheet, que fins ara era l'únic que ho tenia.
  const panel = useRef<HTMLDivElement>(null)
  useModalFocus(panel, onClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setAt((i) => Math.min(photos.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setAt((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [photos.length])

  // El comptador «3 de 42» promet una navegació que amb fletxes de teclat no
  // existeix en un mòbil, que és el 100% del públic: mirar les quaranta fotos
  // de la nit eren vuitanta tocs, tancant i reobrint des de la graella.
  //
  // Dues maneres, perquè cap de les dues es descobreix sola: els botons es
  // veuen i el dit ja ho prova.
  const go = (delta: number) => {
    setAt((i) => Math.min(photos.length - 1, Math.max(0, i + delta)))
  }

  // Només l'horitzontal. Sense comparar-lo amb el vertical, un scroll amb el
  // dit una mica tort canviaria de foto.
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const onTouchEnd = (e: React.TouchEvent) => {
    const from = swipe.current
    const to = e.changedTouches[0]
    swipe.current = null
    if (from === undefined || from === null || to === undefined) return
    const dx = to.clientX - from.x
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(to.clientY - from.y)) return
    go(dx < 0 ? 1 : -1)
  }

  if (photo === null) return null
  const url = urls.get(photo.path) ?? null

  return (
    <div
      ref={panel}
      // Perquè el focus tingui on caure si el diàleg encara no té cap botó.
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t('gallery.viewer.label')}
      className="fixed inset-0 z-50 mx-auto flex max-w-[var(--ds-shell-max-w)] flex-col bg-root outline-none"
    >
      <div className="flex items-center justify-between px-7 py-5">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('actions.close')}
          className="grid size-[44px] place-items-center text-xl text-fg-secondary"
        >
          ✕
        </button>
        <span className="tabular text-sm font-bold text-fg-muted">
          {t('gallery.viewer.position', { n: at + 1, total: photos.length })}
        </span>
        <span className="size-[44px]" />
      </div>

      <div
        onTouchStart={(e) => {
          const t0 = e.touches[0]
          swipe.current = t0 === undefined ? null : { x: t0.clientX, y: t0.clientY }
        }}
        onTouchEnd={onTouchEnd}
        className="relative flex min-h-0 flex-1 items-center justify-center"
      >
        {url === null ? (
          <p className="text-fg-muted">{t('state.loading')}</p>
        ) : (
          <img
            src={url}
            alt=""
            referrerPolicy="no-referrer"
            className="max-h-full max-w-full object-contain"
          />
        )}

        <button
          type="button"
          disabled={at === 0}
          onClick={() => {
            go(-1)
          }}
          aria-label={t('gallery.viewer.prev')}
          className={ARROW + ' left-3'}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          disabled={at === photos.length - 1}
          onClick={() => {
            go(1)
          }}
          aria-label={t('gallery.viewer.next')}
          className={ARROW + ' right-3'}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div className="px-10 pt-7 pb-[calc(var(--ds-safe-bottom)+22px)]">
        <p className="text-[13.5px] font-semibold text-fg-secondary [text-wrap:pretty]">
          {t('gallery.viewer.by', {
            name: photo.nom,
            when: formatDateTime(new Date(photo.created_at), locale),
          })}
        </p>

        <div className="mt-6 flex gap-10">
          <button
            type="button"
            disabled={photo.denunciada}
            onClick={() => {
              setReporting(true)
            }}
            className="min-h-[44px] text-md font-bold text-warning disabled:text-fg-muted-lo"
          >
            {photo.denunciada ? t('gallery.report.already') : t('gallery.report.action')}
          </button>

          {photo.meva || isAdmin ? (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate()
              }}
              className="min-h-[44px] text-md font-bold text-warning disabled:opacity-60"
            >
              {t('gallery.delete')}
            </button>
          ) : null}
        </div>

        {remove.isError ? (
          <p role="alert" className="mt-4 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(remove.error))}
          </p>
        ) : null}
      </div>

      {reporting ? (
        <ReportSheet
          photoId={photo.id}
          onClose={() => {
            setReporting(false)
            void client.invalidateQueries({ queryKey: galleryKeys.all() })
          }}
        />
      ) : null}
    </div>
  )
}
