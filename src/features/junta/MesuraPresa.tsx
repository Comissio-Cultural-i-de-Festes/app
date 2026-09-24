import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { errorKey } from '@/lib/errors'
import { Confirm } from '@/ui/Confirm/Confirm'

import { MAX_MESURA, llegeixMesura } from './avis'
import { avisosKeys, editaMesuraPresa } from './avisosApi'
import { INPUT } from './formBits'

/**
 * La mesura presa d'un avís, a la seva fila de la fitxa: llegir-la i editar-la.
 *
 * AL SEU FITXER perquè porta la seva mutació, com `Retirada` porta la seva al
 * costat. Entra a la fila en una línia i la fila no ha de saber res de com es
 * desa.
 *
 * ES POT EDITAR TAMBÉ EN UN AVÍS RETIRAT: retirar vol dir que deixa de comptar,
 * no que la reunió no es fes. La migració 86 ho escriu i `edita_mesura_presa()`
 * ho deixa fer.
 *
 * EN BLANC L'ESBORRA, i per això el botó no s'apaga amb el camp buit: és la
 * manera de treure una mesura escrita a l'avís equivocat. El que sí que
 * l'apaga és passar-se del límit, que és l'única cosa que la base refusaria.
 *
 * NO NECESSITA `networkMode: 'always'`: no escriu a cap cua. Sense xarxa es
 * queda en pausa i ho diu, com la retirada.
 */
export function MesuraPresa({
  avisId,
  userId,
  mesura,
}: {
  readonly avisId: string
  readonly userId: string
  readonly mesura: string | null
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [editant, setEditant] = useState(false)
  const [text, setText] = useState('')
  const errId = useId()

  const lectura = llegeixMesura(text)

  const desa = useMutation({
    mutationFn: () => editaMesuraPresa(avisId, lectura === 'massa' ? null : lectura.mesura),
    onSuccess: async () => {
      setEditant(false)
      // Les dues entrades de cache de la persona penjen d'aquesta arrel: la
      // fitxa sencera i la del curs que llegeix el seu perfil.
      await client.invalidateQueries({ queryKey: avisosKeys.ofMember(userId) })
    },
  })

  if (!editant) {
    return (
      <>
        {mesura === null ? null : (
          <p className="mt-[6px] text-sm text-fg-secondary [text-wrap:pretty]">
            <span className="font-bold">{t('junta.soci.avisos.mesura')}</span> {mesura}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setText(mesura ?? '')
            setEditant(true)
          }}
          className="mt-3 -ml-4 min-h-[44px] px-4 text-sm font-bold text-fg-secondary [text-wrap:balance]"
        >
          {mesura === null ? t('junta.soci.avisos.mesuraAdd') : t('junta.soci.avisos.mesuraEdit')}
        </button>
      </>
    )
  }

  return (
    <Confirm
      className="mt-5"
      cta={t('actions.save')}
      cancel={t('actions.cancel')}
      busy={desa.isPending}
      disabled={lectura === 'massa'}
      onConfirm={() => {
        desa.mutate()
      }}
      onCancel={() => {
        setEditant(false)
      }}
    >
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
        }}
        rows={2}
        aria-label={t('junta.soci.avisos.mesuraEdit')}
        aria-invalid={lectura === 'massa'}
        aria-describedby={lectura === 'massa' ? errId : undefined}
        placeholder={t('junta.soci.avis.mesuraPlaceholder')}
        maxLength={MAX_MESURA + 20}
        className={`${INPUT} resize-y`}
      />
      <p className="mt-3 text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {t('junta.soci.avisos.mesuraClear')}
      </p>
      {lectura === 'massa' ? (
        <p id={errId} aria-live="polite" className="mt-3 text-sm font-bold text-warning">
          {t('junta.soci.avis.mesuraBad', { max: MAX_MESURA })}
        </p>
      ) : null}
      {desa.isPaused ? (
        <p role="status" className="mt-3 text-sm font-bold text-warning [text-wrap:pretty]">
          {t('junta.soci.avisos.mesuraPaused')}
        </p>
      ) : null}
      {desa.isError ? (
        <p role="alert" className="mt-3 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(desa.error))}
        </p>
      ) : null}
    </Confirm>
  )
}
