import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { JuntaHeader } from '@/features/junta/JuntaHeader'
import { isPermanent } from '@/lib/db'
import { errorKey } from '@/lib/errors'
import { Notice } from '@/ui/Notice/Notice'

import { fetchGimcana, gimcanaKeys, submitProva } from './api'

/**
 * Enviar una prova.
 *
 * La foto es tria del carret o es fa amb la càmera —`capture` deixa que ho
 * decideixi el telèfon, que és qui sap si en té— i s'envia a validar. Els punts
 * surten quan la junta digui que val, i això es diu aquí abans de prémer res:
 * el marcador que no es mou de seguida només decep si ningú havia avisat.
 *
 * SENSE COBERTURA TAMBÉ FUNCIONA. La foto es desa a la cua abans d'intentar
 * enviar-la, i surt sola quan torni la xarxa. `networkMode: 'always'` no és
 * decoració: sense això React Query posa la mutació en pausa quan
 * `navigator.onLine` diu que no, i la crida que escriu a la cua viu a dins.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function SubmitScreen() {
  const { t } = useTranslation()
  const { id = '', provaId = '' } = useParams()
  const navigate = useNavigate()
  const client = useQueryClient()
  const picker = useRef<HTMLInputElement>(null)
  // Els dos van junts, i el blob-URL es crea al gestor que ha triat la foto —
  // mai durant un render. Al cos del render, cada repintada mentre s'envia en
  // creava un de nou sense alliberar l'anterior: amb fotos de 12 MP són megues
  // que no tornen fins que es tanca la pestanya. Mateix patró que el
  // `CoverPicker` del formulari d'esdeveniment.
  const [photo, setPhoto] = useState<{ readonly file: File; readonly url: string } | null>(null)
  // El darrer URL viu en un ref i no a les dependències d'un efecte: amb
  // `[photo]`, el doble muntatge de StrictMode revocaria l'URL just després de
  // crear-lo i la previsualització sortiria trencada en desenvolupament. Aquí
  // el revoca qui el substitueix, i el desmuntatge s'emporta el que quedi.
  const lastUrl = useRef<string | null>(null)
  useEffect(
    () => () => {
      if (lastUrl.current !== null) URL.revokeObjectURL(lastUrl.current)
    },
    [],
  )

  const gimcana = useQuery({
    queryKey: gimcanaKeys.one(id),
    queryFn: () => fetchGimcana(id),
    enabled: id !== '',
  })

  const open = gimcana.data?.estat === 'oberta' ? gimcana.data : null
  const prova = open?.proves.find((p) => p.id === provaId) ?? null

  const send = useMutation({
    networkMode: 'always',
    mutationFn: () => {
      if (photo === null) throw new Error('cap foto')
      return submitProva(provaId, photo.file)
    },
    onSuccess: async (estat) => {
      await client.invalidateQueries({ queryKey: gimcanaKeys.all() })
      if (estat === 'enviada' || estat === 'ja_enviada' || estat === 'ja_feta') {
        void navigate(`/esdeveniment/${id}/gimcana`, { replace: true })
      }
    },
  })

  return (
    <main className="min-h-dvh bg-app pb-10">
      <JuntaHeader to={`/esdeveniment/${id}/gimcana`} label={t('gimcana.title')} />

      <div className={GUTTER}>
        {prova === null ? (
          <p className="py-8 text-md text-fg-muted [text-wrap:pretty]">{t('gimcana.gone')}</p>
        ) : (
          <>
            <p className="eyebrow text-brand-accent">
              {t('gimcana.worthEyebrow', { n: prova.punts })}
            </p>
            <h1 className="display mt-4 text-d-s tracking-[-0.045em] [text-wrap:balance]">
              {prova.titol}
            </h1>
            {prova.descripcio === null ? null : (
              <p className="mt-5 text-sm text-fg-muted [text-wrap:pretty]">{prova.descripcio}</p>
            )}

            {/* El «no val» de l'última vegada, amb el perquè. Sense ell, tornar
                a provar-ho és endevinar. */}
            {prova.estat === 'rebutjada' ? (
              <Notice as="div" tone="neutral" className="mt-7">
                <p className="text-base font-bold [text-wrap:pretty]">
                  {t('gimcana.rejected.title')}
                </p>
                <p className="mt-3 text-sm text-fg-muted [text-wrap:pretty]">
                  {prova.motiu === null || prova.motiu === 'ja_validada'
                    ? t('gimcana.rejected.noReason')
                    : `«${prova.motiu}»`}
                </p>
              </Notice>
            ) : null}

            <input
              ref={picker}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                if (lastUrl.current !== null) URL.revokeObjectURL(lastUrl.current)
                lastUrl.current = file === null ? null : URL.createObjectURL(file)
                setPhoto(
                  file === null || lastUrl.current === null ? null : { file, url: lastUrl.current },
                )
                e.target.value = ''
              }}
            />

            <button
              type="button"
              onClick={() => {
                picker.current?.click()
              }}
              className="mt-7 flex h-[250px] w-full items-center justify-center border border-dashed border-surface-7 bg-surface-1 text-md font-bold text-fg-muted"
            >
              {photo === null ? (
                t('gimcana.takePhoto')
              ) : (
                <img src={photo.url} alt="" className="size-full object-cover" />
              )}
            </button>

            <button
              type="button"
              disabled={photo === null || send.isPending}
              onClick={() => {
                send.mutate()
              }}
              className="mt-7 flex min-h-[56px] w-full items-center justify-center bg-brand-cta px-9 py-7 text-xl font-bold text-on-brand [text-wrap:balance] disabled:opacity-45"
            >
              {send.isPending ? t('state.loading') : t('gimcana.send')}
            </button>

            {/* Una xarxa caiguda no és un error aquí: la foto ja és a la cua i
                sortirà sola. Ensenyar «sense connexió» en vermell faria pensar que
                s'ha perdut, i és justament el cas per al qual existeix la cua. */}
            {send.isError ? (
              isPermanent(send.error) ? (
                <p role="alert" className="mt-5 text-md font-bold text-error [text-wrap:pretty]">
                  {t(errorKey(send.error))}
                </p>
              ) : (
                <Notice live className="mt-5">
                  {t('gimcana.queued')}
                </Notice>
              )
            ) : null}

            <p className="mt-6 text-sm text-fg-muted-lo [text-wrap:pretty]">
              {t('gimcana.sendNote')}
            </p>
            <p className="mt-4 text-sm text-fg-muted-lo [text-wrap:pretty]">
              {t('gimcana.offlineNote')}
            </p>
          </>
        )}
      </div>
    </main>
  )
}
