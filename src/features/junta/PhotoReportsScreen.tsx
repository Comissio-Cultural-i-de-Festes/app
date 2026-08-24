import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { decidePhoto, fetchReported, fetchUrls, galleryKeys } from '@/features/gallery/api'
import { errorKey } from '@/lib/errors'

import { JuntaHeader } from './JuntaHeader'

/**
 * Les fotos que algú ha demanat que mireu.
 *
 * Dos botons i cap tercer. «Despenja-la» l'amaga de tothom a l'instant;
 * «Deixa-la» diu que ja s'ha mirat. Les dues buiden la cua, perquè la feina de
 * la junta és mirar-la i mirar-la ja s'ha fet.
 *
 * QUI VA DENUNCIAR NO SURT ENLLOC, ni aquí. La junta no ho necessita per
 * decidir, i el dia que ho sabés algú, la funció deixaria de servir per al cas
 * que la justifica: surt gent a les fotos que no ha demanat sortir-hi, i ho ha
 * de poder dir sense quedar-hi retratada.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function PhotoReportsScreen() {
  const { t } = useTranslation()
  const client = useQueryClient()

  const reports = useQuery({ queryKey: galleryKeys.reports(), queryFn: fetchReported })

  const thumbs = (reports.data ?? []).map((r) => r.thumb_path)
  const urls = useQuery({
    queryKey: galleryKeys.urls(thumbs),
    queryFn: () => fetchUrls(thumbs),
    enabled: thumbs.length > 0,
  })

  const decide = useMutation({
    mutationFn: ({ id, hide }: { id: string; hide: boolean }) => decidePhoto(id, hide),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: galleryKeys.all() })
      await client.invalidateQueries({ queryKey: galleryKeys.reports() })
    },
  })

  const rows = reports.data ?? []

  return (
    <main className="min-h-dvh bg-app pb-10">
      <JuntaHeader to="/junta" label={t('junta.back')} />

      <div className={`pt-2 ${GUTTER}`}>
        <div className="flex items-baseline justify-between gap-5">
          <h1 className="display text-d-s tracking-[-0.045em]">{t('junta.photos.title')}</h1>
          <span className="tabular text-[12.5px] font-bold text-[var(--ds-warning)]">
            {rows.length > 0 ? String(rows.length) : ''}
          </span>
        </div>

        {reports.isPending ? (
          <p className="py-8 text-fg-muted">{t('state.loading')}</p>
        ) : reports.isError ? (
          <p role="alert" className="py-8 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(reports.error))}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-md text-fg-muted [text-wrap:pretty]">{t('junta.photos.empty')}</p>
        ) : (
          <ul className="mt-7 grid gap-7">
            {rows.map((r) => (
              <li key={r.photo_id} className="border border-surface-5 p-7">
                <div className="flex gap-6">
                  <span className="size-[64px] flex-none bg-surface-5">
                    {urls.data?.get(r.thumb_path) === undefined ? null : (
                      <img
                        src={urls.data.get(r.thumb_path)}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="size-full object-cover"
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-md font-bold [text-wrap:pretty]">
                      «{t(`gallery.report.${r.motiu}`)}»
                    </p>
                    <p className="mt-[3px] text-[12.5px] text-fg-muted-lo [text-wrap:pretty]">
                      {t('junta.photos.by', { event: r.titol, name: r.pujada_per })}
                    </p>
                    {r.quantes > 1 ? (
                      <p className="tabular mt-[3px] text-[12.5px] font-bold text-[var(--ds-warning)]">
                        {t('junta.photos.times', { count: r.quantes })}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    disabled={decide.isPending}
                    onClick={() => {
                      decide.mutate({ id: r.photo_id, hide: true })
                    }}
                    className="flex min-h-[46px] items-center justify-center border-[1.5px] border-[var(--ds-warning)] px-6 py-4 text-md font-bold text-warning [text-wrap:balance] disabled:opacity-60"
                  >
                    {t('junta.photos.hide')}
                  </button>
                  <button
                    type="button"
                    disabled={decide.isPending}
                    onClick={() => {
                      decide.mutate({ id: r.photo_id, hide: false })
                    }}
                    className="flex min-h-[46px] items-center justify-center border-[1.5px] border-surface-7 px-6 py-4 text-md font-bold text-fg-secondary [text-wrap:balance] disabled:opacity-60"
                  >
                    {t('junta.photos.keep')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-7 text-[12.5px] text-fg-muted-lo [text-wrap:pretty]">
          {t('junta.photos.note')}
        </p>
      </div>
    </main>
  )
}
