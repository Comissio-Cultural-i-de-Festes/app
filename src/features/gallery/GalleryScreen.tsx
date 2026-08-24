import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { eventKeys, fetchEvent } from '@/features/event/api'
import { fetchAttendances, homeKeys, myAnswer } from '@/features/home/api'
import { JuntaHeader } from '@/features/junta/JuntaHeader'
import { isJunta, useMyProfile } from '@/features/session/useMyProfile'
import { useUserId } from '@/features/session/useUserId'
import { errorKey } from '@/lib/errors'

import { fetchPhotos, fetchUrls, galleryKeys, uploadPhoto } from './api'
import { Viewer } from './Viewer'

/**
 * La graella d'una nit.
 *
 * AQUÍ TOT SÓN MINIATURES. La bona, amb tot el detall, només es baixa quan
 * s'obre una. És la meitat del disseny que fa que recórrer dues-centes fotos
 * siguin cinc megues i no trenta-sis, i és la raó per la qual això va a
 * Supabase sense cap servidor pel mig.
 *
 * PUGEN ELS QUE HI VAN FITXAR. No els que van dir que hi anirien: els que hi
 * eren. El botó no surt a ningú més, i la base ho torna a dir per si el botó
 * s'equivoca.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

type UploadState = 'esperant' | 'pujant' | 'feta' | 'fallada'
interface Pending {
  readonly file: File
  readonly state: UploadState
}

export function GalleryScreen() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const userId = useUserId()
  const client = useQueryClient()
  const { data: profile } = useMyProfile()
  const picker = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState<number | null>(null)
  const [queue, setQueue] = useState<readonly Pending[]>([])
  const [busy, setBusy] = useState(false)

  // Només per a la fletxa d'enrere. El disseny hi posa el nom de l'activitat, i
  // «enrere» a seques no diu on tornes quan has arribat des de tres llocs.
  const event = useQuery({
    queryKey: eventKeys.one(id),
    queryFn: () => fetchEvent(id),
    enabled: id !== '',
  })

  const photos = useQuery({
    queryKey: galleryKeys.photos(id),
    queryFn: () => fetchPhotos(id),
    enabled: id !== '',
  })

  const paths = (photos.data ?? []).flatMap((p) => [p.thumb_path, p.path])
  const urls = useQuery({
    queryKey: galleryKeys.urls(paths),
    queryFn: () => fetchUrls(paths),
    enabled: paths.length > 0,
  })

  const mine = useQuery({
    queryKey: homeKeys.attendances([id]),
    queryFn: () => fetchAttendances([id]),
    enabled: id !== '',
  })
  const wasThere = myAnswer(mine.data ?? [], id, userId) === 'asistio'

  /**
   * D'una en una i no totes alhora.
   *
   * Quinze peticions en paral·lel sobre el wifi d'una sala amb dues-centes
   * persones és la manera de fer que no n'arribi cap. Les que fallin es queden
   * a la llista amb el seu «torna-hi» en comptes de desaparèixer.
   */
  async function run(files: readonly File[]): Promise<void> {
    setBusy(true)
    for (const [i, file] of files.entries()) {
      setQueue((q) => q.map((p, j) => (j === i ? { ...p, state: 'pujant' } : p)))
      try {
        await uploadPhoto(file, id, userId)
        setQueue((q) => q.map((p, j) => (j === i ? { ...p, state: 'feta' } : p)))
      } catch {
        setQueue((q) => q.map((p, j) => (j === i ? { ...p, state: 'fallada' } : p)))
      }
    }
    setBusy(false)
    await client.invalidateQueries({ queryKey: galleryKeys.all() })
  }

  const done = queue.filter((p) => p.state === 'feta').length
  const failed = queue.filter((p) => p.state === 'fallada')

  return (
    <main className="with-tabbar min-h-dvh bg-app">
      <JuntaHeader to={`/esdeveniment/${id}`} label={event.data?.titulo ?? t('gallery.backToEvent')} />

      <div className={`pt-2 ${GUTTER}`}>
        <div className="flex items-baseline justify-between gap-5">
          <h1 className="display text-d-s tracking-[-0.045em]">{t('gallery.title')}</h1>
          <span className="tabular text-[12.5px] font-bold text-fg-muted-lo">
            {t('gallery.countShort', {
              n: photos.data?.length ?? 0,
              people: t('gallery.people', {
                count: new Set((photos.data ?? []).map((p) => p.user_id)).size,
              }),
            })}
          </span>
        </div>

        {wasThere ? (
          <>
            <input
              ref={picker}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])]
                e.target.value = ''
                if (files.length === 0) return
                setQueue(files.map((file) => ({ file, state: 'esperant' as const })))
                void run(files)
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                picker.current?.click()
              }}
              className="mt-6 flex min-h-[50px] w-full items-center justify-center bg-brand-cta px-8 py-6 text-base font-bold text-on-brand [text-wrap:balance] disabled:opacity-60"
            >
              {t('gallery.upload')}
            </button>
            <p className="mt-4 text-[12.5px] text-fg-muted-lo [text-wrap:pretty]">
              {t('gallery.whoCanUpload')}
            </p>
          </>
        ) : null}

        {queue.length === 0 ? null : (
          <Progress queue={queue} done={done} onRetry={() => void run(failed.map((p) => p.file))} />
        )}
      </div>

      {photos.isPending ? (
        <p className={`py-8 text-fg-muted ${GUTTER}`}>{t('state.loading')}</p>
      ) : photos.isError ? (
        <p role="alert" className={`py-8 text-md font-bold text-error ${GUTTER}`}>
          {t(errorKey(photos.error))}
        </p>
      ) : (photos.data?.length ?? 0) === 0 ? (
        <Empty wasThere={wasThere} />
      ) : (
        <>
          <div className="mt-7 grid grid-cols-3 gap-[2px]">
            {(photos.data ?? []).map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setOpen(i)
                }}
                className="aspect-square bg-surface-3"
              >
                {urls.data?.get(p.thumb_path) === undefined ? null : (
                  <img
                    src={urls.data.get(p.thumb_path)}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="size-full object-cover"
                  />
                )}
              </button>
            ))}
          </div>
          <p className={`mt-6 pb-10 text-[12.5px] text-fg-muted-lo [text-wrap:pretty] ${GUTTER}`}>
            {t('gallery.thumbsNote')}
          </p>
        </>
      )}

      {open === null || photos.data === undefined ? null : (
        <Viewer
          photos={photos.data}
          index={open}
          urls={urls.data ?? new Map()}
          isAdmin={isJunta(profile)}
          onClose={() => {
            setOpen(null)
          }}
        />
      )}
    </main>
  )
}

/**
 * Pujant.
 *
 * La barra és de fitxers acabats i no de bytes: `upload` de Supabase no diu
 * quant en porta, i dibuixar una barra que avanci sola seria inventar-se una
 * xifra. Amb quinze fotos, quinze passos ja és prou moviment per saber que no
 * s'ha penjat.
 */
function Progress({
  queue,
  done,
  onRetry,
}: {
  readonly queue: readonly Pending[]
  readonly done: number
  readonly onRetry: () => void
}) {
  const { t } = useTranslation()
  const failed = queue.some((p) => p.state === 'fallada')

  return (
    <section className="mt-7 border border-surface-5 bg-surface-1 px-9 py-8">
      <div className="flex items-baseline justify-between gap-5">
        <h2 className="display text-d-sm tracking-[-0.045em]">{t('gallery.uploading')}</h2>
        <span className="tabular text-[12.5px] font-bold text-fg-muted-lo">
          {t('gallery.uploadCount', { n: done, total: queue.length })}
        </span>
      </div>

      <div className="mt-4 h-[6px] bg-surface-3">
        <div
          className="h-[6px] bg-success transition-[width]"
          style={{ width: `${String(Math.round((done / queue.length) * 100))}%` }}
        />
      </div>

      <ul className="mt-7 grid gap-5">
        {queue.map((p, i) => (
          <li key={`${p.file.name}${String(i)}`} className="flex items-center gap-6">
            <span className="size-[44px] flex-none bg-surface-4" />
            <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary">
              {p.file.name} · {t(`gallery.state.${p.state}`)}
            </span>
            {p.state === 'feta' ? (
              <span aria-hidden="true" className="flex-none text-md font-extrabold text-success">
                ✓
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {failed ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 min-h-[44px] text-md font-bold text-warning"
        >
          {t('actions.retry')}
        </button>
      ) : null}

      <p className="mt-6 text-[12.5px] text-fg-muted-lo [text-wrap:pretty]">
        {t('gallery.uploadNote')}
      </p>
    </section>
  )
}

/** Dues frases diferents, perquè són dues situacions diferents. */
function Empty({ wasThere }: { readonly wasThere: boolean }) {
  const { t } = useTranslation()
  return (
    <div className={`pt-10 pb-10 ${GUTTER}`}>
      <p className="display text-[22px] tracking-[-0.04em] [text-wrap:balance]">
        {t('gallery.empty.title')}
      </p>
      <p className="mt-4 text-sm text-fg-muted [text-wrap:pretty]">
        {wasThere ? t('gallery.empty.yours') : t('gallery.empty.theirs')}
      </p>
    </div>
  )
}
