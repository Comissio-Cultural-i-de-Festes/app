import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { errorKey } from '@/lib/errors'
import { Sheet, SheetClose } from '@/ui/Sheet/Sheet'

import { type ReportReason, reportPhoto } from './api'

/**
 * «Què li passa, a aquesta foto?»
 *
 * Existeix per una raó i les altres dues són d'acompanyament: surt gent a les
 * fotos que no ha demanat sortir-hi. Per això el primer motiu és aquest, i per
 * això la denúncia és anònima per a tothom qui no sigui la junta — si qui la va
 * pujar pogués saber qui ho ha demanat, ningú ho demanaria.
 */

const REASONS: readonly ReportReason[] = ['hi_surto', 'no_es_d_aquella_nit', 'altra']

export function ReportSheet({
  photoId,
  onClose,
}: {
  readonly photoId: string
  readonly onClose: () => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState<ReportReason>('hi_surto')

  const send = useMutation({
    mutationFn: () => reportPhoto(photoId, reason),
    onSuccess: onClose,
  })

  return (
    <Sheet label={t('gallery.report.title')} onClose={onClose}>
      <div className="flex items-start justify-between gap-5">
        <h2 className="pt-3 text-lg font-bold [text-wrap:pretty]">{t('gallery.report.title')}</h2>
        <SheetClose onClose={onClose} />
      </div>

      <div className="mt-6 grid gap-4">
        {REASONS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={reason === r}
            onClick={() => {
              setReason(r)
            }}
            className={
              'min-h-[44px] px-8 py-7 text-left text-base font-semibold ' +
              (reason === r
                ? 'selected--soft text-fg'
                : 'border border-surface-5 text-fg-secondary')
            }
          >
            {t(`gallery.report.${r}`)}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={send.isPending}
        onClick={() => {
          send.mutate()
        }}
        className="mt-7 flex min-h-[56px] w-full items-center justify-center bg-brand-cta px-9 py-7 text-xl font-bold text-on-brand [text-wrap:balance] disabled:opacity-60"
      >
        {send.isPending ? t('state.loading') : t('gallery.report.send')}
      </button>

      {send.isError ? (
        <p role="alert" className="mt-5 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(send.error))}
        </p>
      ) : null}

      <p className="mt-6 text-[12.5px] text-fg-muted-lo [text-wrap:pretty]">
        {t('gallery.report.note')}
      </p>
    </Sheet>
  )
}
