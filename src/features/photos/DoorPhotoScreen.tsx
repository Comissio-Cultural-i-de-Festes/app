import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import { brand } from '@/config/brand'
import { useUserId } from '@/features/session/useUserId'
import { formatTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { captureFrame } from '@/lib/frame'

import { fetchNights, fetchPhotoUrls, photoKeys, saveEntryPhoto, saveExitPhoto } from './api'
import { useSelfie } from './useSelfie'

/**
 * Les dues fotos de la nit, amb la mateixa càmera.
 *
 * Quina, ho diu `?half=`. Des de la migració 36 totes dues te les fas tu: la
 * d'arribada la disparava l'escàner tot sol i ja no, o sigui que l'única
 * diferència entre les dues és el text i on va a parar el fitxer.
 *
 * La càmera es demana aquí i no en obrir l'app: un objectiu que s'encén sol a
 * les onze del matí és una emboscada. Sempre a un toc d'un botó que diu per
 * què.
 *
 * A la de sortida, la d'arribada surt a la cantonada mentre te la fas, que és
 * tota la gràcia del díptic. Només la teva: la política d'storage refusaria la
 * de qualsevol altre.
 */

const NO_FRAME = 'no_frame'

export function DoorPhotoScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.language)
  const { eventId } = useParams()
  const [params] = useSearchParams()
  const id = eventId ?? ''
  // Sortida per defecte: és la que porta enllaçada tot el que hi havia abans
  // d'existir la d'arribada.
  const half = params.get('half') === 'entrada' ? 'entrada' : 'sortida'
  const meId = useUserId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const videoRef = useRef<HTMLVideoElement>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  // A shutter over a black rectangle is a button that cannot work. The video
  // tells us when it has a size, and until then there is nothing to capture:
  // that is the state between the permission dialog closing and the first
  // frame, and on a slow phone it is a visible second.
  const [ready, setReady] = useState(false)
  const cameraError = useSelfie(videoRef, facing)

  const nights = useQuery({ queryKey: photoKeys.nights(), queryFn: fetchNights })
  const night = nights.data?.find((n) => n.event_id === id)

  const entry = night?.entry_photo_url ?? null
  const thumb = useQuery({
    queryKey: photoKeys.urls(entry === null ? [] : [entry]),
    queryFn: () => fetchPhotoUrls(entry === null ? [] : [entry]),
    enabled: entry !== null,
  })

  const save = useMutation({
    mutationFn: async () => {
      const photo = await captureFrame(videoRef.current)
      // The camera opened but has not delivered a frame yet, which happens for
      // the first moment after the permission dialog closes. Its own message:
      // routing it through errorKey would blame the network for a lens that is
      // still waking up.
      if (photo === null) throw new Error(NO_FRAME)
      if (half === 'entrada') await saveEntryPhoto(id, meId, photo)
      else await saveExitPhoto(id, meId, photo)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: photoKeys.nights() })
      await navigate(half === 'entrada' ? `/esdeveniment/${id}` : `/perfil/nits/${id}`, {
        replace: true,
      })
    },
  })

  const back = () => {
    void navigate(-1)
  }

  return (
    <main className="relative flex min-h-dvh flex-col bg-[var(--ds-bg-door)] text-fg">
      <video
        ref={videoRef}
        playsInline
        muted
        aria-hidden="true"
        onLoadedMetadata={() => {
          setReady(true)
        }}
        // Mirrored on the front camera only. A selfie that is not mirrored
        // looks like somebody else, and a rear shot that is looks like a
        // mistake.
        className={`absolute inset-0 size-full object-cover ${facing === 'user' ? 'scale-x-[-1]' : ''}`}
      />
      <div aria-hidden="true" className="door-scrim absolute inset-0" />

      <header className="relative z-10 pt-[calc(var(--ds-safe-top)+8px)]">
        <div className="flex items-center justify-between gap-5 px-8">
          <button
            type="button"
            onClick={back}
            aria-label={t('actions.close')}
            className="grid size-[44px] place-items-center text-xl font-bold text-fg"
          >
            <span aria-hidden="true">✕</span>
          </button>
          <p className="eyebrow text-fg-secondary">{t(`doorPhoto.${half}.eyebrow`)}</p>
          <button
            type="button"
            onClick={() => {
              setReady(false)
              setFacing((f) => (f === 'user' ? 'environment' : 'user'))
            }}
            aria-label={t('exitPhoto.flip')}
            className="grid size-[44px] place-items-center text-lg text-fg"
          >
            <span aria-hidden="true">⟳</span>
          </button>
        </div>
      </header>

      {/* How you came in, while you decide how you are going out. */}
      {half === 'entrada' || entry === null ? null : (
        <div className="absolute top-[118px] right-8 z-10 w-[88px]">
          <img
            src={thumb.data?.get(entry) ?? ''}
            alt={t('exitPhoto.entryAlt')}
            className="h-[118px] w-full border-2 border-[oklch(0.97_0.008_60/0.5)] bg-surface-3 object-cover"
          />
          <p className="eyebrow mt-4 text-right text-[10.5px] text-fg-secondary">
            {t('exitPhoto.thatsHowYouCameIn')}
          </p>
          {night?.checked_in_at == null ? null : (
            <p className="text-right text-[10.5px] font-bold text-fg-muted">
              {formatTime(new Date(night.checked_in_at), locale)}
            </p>
          )}
        </div>
      )}

      <div className="relative z-10 flex-1" />

      {cameraError === null ? (
        <div className="relative z-10 bg-[oklch(0.11_0.008_25/0.9)] px-8 pt-8">
          <h1 className="display text-d-sm leading-[0.98] tracking-[-0.042em] [text-wrap:balance]">
            {t(`doorPhoto.${half}.title`)}
          </h1>
          <p className="mt-5 text-sm text-fg-secondary [text-wrap:pretty]">
            {t(`doorPhoto.${half}.note`)}
          </p>
        </div>
      ) : (
        <div className="relative z-10 bg-[oklch(0.11_0.008_25/0.9)] px-8 pt-8">
          <p role="alert" className="text-lg font-bold text-[var(--ds-warning)] [text-wrap:pretty]">
            {/* Les d'aquesta pantalla i no les de l'escàner: aquelles diuen
                «fes l'alta pel nom», que és una acció de la junta i no de qui
                s'està fent la foto. */}
            {t(`doorPhoto.camera.${cameraError}`, { app: brand.shortName })}
          </p>
        </div>
      )}

      {save.isError ? (
        <p
          role="alert"
          className="relative z-10 bg-[oklch(0.11_0.008_25/0.9)] px-8 pt-5 text-md font-bold text-error [text-wrap:pretty]"
        >
          {t(
            save.error instanceof Error && save.error.message === NO_FRAME
              ? 'exitPhoto.noFrame'
              : errorKey(save.error),
          )}
        </p>
      ) : null}

      <footer className="relative z-10 bg-[oklch(0.11_0.008_25/0.9)] px-8 py-9 pb-[calc(var(--ds-safe-bottom)+22px)]">
        <div className="flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={back}
            className="min-h-[44px] min-w-[64px] text-left text-base font-bold text-fg-secondary"
          >
            {t('exitPhoto.notNow')}
          </button>
          <button
            type="button"
            disabled={cameraError !== null || !ready || save.isPending}
            onClick={() => {
              save.mutate()
            }}
            aria-label={t('exitPhoto.shutter')}
            className="size-[78px] flex-none rounded-full border-4 border-fg bg-brand-cta shadow-[0_0_0_6px_var(--ds-bg-door)] disabled:opacity-40"
          />
          <span className="min-w-[64px] text-right text-sm-lo font-semibold text-fg-muted [text-wrap:pretty]">
            {save.isPending
              ? t('exitPhoto.saving')
              : ready
                ? t('exitPhoto.canRetake')
                : t('exitPhoto.waking')}
          </span>
        </div>
      </footer>
    </main>
  )
}
