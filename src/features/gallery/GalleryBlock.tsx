import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { fetchPhotoCount, fetchPhotos, fetchUrls, galleryKeys } from './api'

/**
 * On comença la galeria: tres miniatures al detall d'una activitat passada.
 *
 * No és la graella retallada, és la porta. Tres caselles i «+39» diuen que hi
 * ha alguna cosa a mirar sense baixar-ne quaranta-dues, que és exactament el
 * problema que aquesta funció existeix per no tenir.
 *
 * Amb zero fotos el bloc segueix sortint: qui hi va ser ha de poder pujar la
 * primera, i qui no hi va ser ha de saber que d'aquí a una estona n'hi haurà.
 */

const PEEK = 3

export function GalleryBlock({ eventId }: { readonly eventId: string }) {
  const { t } = useTranslation()

  const count = useQuery({
    queryKey: galleryKeys.count(eventId),
    queryFn: () => fetchPhotoCount(eventId),
  })

  // Només les tres primeres files, i només les seves miniatures. La graella
  // sencera la demana la pantalla de la galeria.
  const photos = useQuery({
    queryKey: galleryKeys.photos(eventId),
    queryFn: () => fetchPhotos(eventId),
  })

  const first = (photos.data ?? []).slice(0, PEEK)
  const thumbs = first.map((p) => p.thumb_path)
  const urls = useQuery({
    queryKey: galleryKeys.urls(thumbs),
    queryFn: () => fetchUrls(thumbs),
    enabled: thumbs.length > 0,
  })

  const total = count.data?.quantes ?? 0
  const rest = Math.max(0, total - PEEK)

  return (
    <section className="pt-12 px-[var(--ds-gutter)]">
      <div className="flex items-baseline justify-between gap-5">
        <h2 className="eyebrow text-fg-muted">{t('gallery.title')}</h2>
        {total === 0 ? null : (
          <span className="tabular text-[12.5px] font-bold text-fg-muted-lo">
            {t('gallery.count', {
              n: total,
              people: t('gallery.people', { count: count.data?.persones ?? 0 }),
            })}
          </span>
        )}
      </div>

      {total === 0 ? (
        <p className="mt-5 text-sm text-fg-muted [text-wrap:pretty]">{t('gallery.blockEmpty')}</p>
      ) : (
        <div className="mt-5 grid grid-cols-3 gap-[2px]">
          {first.map((p, i) => (
            <div key={p.id} className="relative aspect-square bg-surface-4">
              {urls.data?.get(p.thumb_path) === undefined ? null : (
                <img
                  src={urls.data.get(p.thumb_path)}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="size-full object-cover"
                />
              )}
              {i === PEEK - 1 && rest > 0 ? (
                <span className="absolute inset-0 grid place-items-center bg-[oklch(0.1_0.008_25_/_0.6)] text-base font-extrabold">
                  +{rest}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Link
        to={`/esdeveniment/${eventId}/fotos`}
        className="mt-5 flex min-h-[50px] items-center justify-between border-[1.5px] border-surface-7 px-8 py-5 text-md font-bold text-fg-secondary no-underline"
      >
        {total === 0 ? t('gallery.openEmpty') : t('gallery.openAll')}
        <span aria-hidden="true" className="text-xl text-fg-muted-lo">
          ›
        </span>
      </Link>
    </section>
  )
}
