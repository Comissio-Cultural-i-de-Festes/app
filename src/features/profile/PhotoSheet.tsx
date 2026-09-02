import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Sheet, SheetClose } from '@/ui/Sheet/Sheet'

import { CameraIcon, GalleryIcon } from './icons'

/**
 * D'on surt la foto: la càmera, la galeria, la de Google, o cap.
 *
 * SOBRE `Sheet` I NO UN MODAL PROPI. Ja porta l'Escape, la trampa del
 * tabulador, el bloqueig del scroll i el focus que torna al botó que l'ha
 * obert, i està ancorat a la columna de 430 px en comptes del top layer.
 *
 * LA CÀMERA ÉS UN `capture="user"` I NO UNA PANTALLA. `DoorPhotoScreen` sí que
 * obre la càmera dins de l'app, perquè allà la foto s'ha de fer en aquell
 * moment i en aquell lloc i el resultat no ha de passar pel rodet. Una foto de
 * perfil no té res d'això: al telèfon `capture="user"` obre la càmera del
 * sistema, que enfoca millor, deixa tornar a provar i és el gest que la gent ja
 * coneix. Al portàtil cau al selector de fitxers, que és el que hi ha.
 *
 * «TREU-LA» EN AMBRE. És l'acció que desfà, i ambre és el que fan servir totes
 * —el vermell és la marca. No demana confirmació: tornar-hi és un toc i el que
 * es perd és un fitxer que la persona ja té al telèfon.
 */

export function PhotoSheet({
  hasPhoto,
  onPick,
  onGoogle,
  onClear,
  onClose,
}: {
  readonly hasPhoto: boolean
  readonly onPick: (file: File) => void
  readonly onGoogle: () => void
  readonly onClear: () => void
  readonly onClose: () => void
}) {
  const { t } = useTranslation()
  const cameraId = useId()
  const galleryId = useId()

  const ROW =
    'flex min-h-[56px] w-full cursor-pointer items-center gap-6 rounded-cta border-0 px-9 py-7 ' +
    'text-left font-body text-lg font-bold'

  return (
    <Sheet label={t('profile.photo.title')} onClose={onClose}>
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <p className="display text-d-xs leading-[1.05] tracking-[-0.04em] [text-wrap:balance]">
            {t('profile.photo.title')}
          </p>
          <p className="mt-4 text-sm leading-[1.4] text-fg-muted [text-wrap:pretty]">
            {t('profile.photo.body')}
          </p>
        </div>
        <SheetClose onClose={onClose} />
      </div>

      <div className="mt-9 flex flex-col gap-4">
        <label htmlFor={cameraId} className={`${ROW} bg-brand-cta text-on-brand`}>
          <CameraIcon className="flex-none" />
          <span className="flex-1 [text-wrap:balance]">{t('profile.photo.camera')}</span>
        </label>
        <input
          id={cameraId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          className="sr-only"
          onChange={(e) => {
            const picked = e.target.files?.[0]
            e.target.value = ''
            if (picked) onPick(picked)
          }}
        />

        <label
          htmlFor={galleryId}
          className={`${ROW} border-[1.5px] border-surface-7 bg-surface-1 text-fg`}
        >
          <GalleryIcon className="flex-none" />
          <span className="flex-1 [text-wrap:balance]">{t('profile.photo.gallery')}</span>
        </label>
        <input
          id={galleryId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const picked = e.target.files?.[0]
            e.target.value = ''
            if (picked) onPick(picked)
          }}
        />

        <button
          type="button"
          onClick={onGoogle}
          className={`${ROW} border-[1.5px] border-surface-7 bg-surface-1 text-fg`}
        >
          <span
            aria-hidden="true"
            className="grid size-[19px] flex-none place-items-center rounded-full bg-google-bg text-xs font-extrabold text-google-fg"
          >
            G
          </span>
          <span className="flex-1 [text-wrap:balance]">{t('profile.photo.google')}</span>
        </button>

        {/* Només si n'hi ha alguna. «Treu-la» amb la placa ja buida és un botó
            que no fa res, i un botó que no fa res es prem. */}
        {hasPhoto ? (
          <button
            type="button"
            onClick={onClear}
            className="flex min-h-[52px] w-full items-center justify-center border-0 bg-transparent px-9 py-6 font-body text-base font-bold text-warning [text-wrap:balance]"
          >
            {t('profile.photo.clear')}
          </button>
        ) : null}
      </div>
    </Sheet>
  )
}
