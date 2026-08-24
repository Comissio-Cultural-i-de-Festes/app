import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDateTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setAt((i) => Math.min(photos.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setAt((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, photos.length])

  if (photo === null) return null
  const url = urls.get(photo.path) ?? null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('gallery.viewer.label')}
      className="fixed inset-0 z-50 mx-auto flex max-w-[var(--ds-shell-max-w)] flex-col bg-root"
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

      <div className="flex min-h-0 flex-1 items-center justify-center">
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
