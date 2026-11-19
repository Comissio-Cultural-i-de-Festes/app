import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { profileScreenKeys } from '@/features/profile/api'
import { errorKey } from '@/lib/errors'
import { Confirm } from '@/ui/Confirm/Confirm'

import { notaValida } from './avis'
import { type AvisRow, rebutjaAvis, validaAvis } from './avisosApi'
import { accionsSobre } from './estatAvisos'
import { INPUT } from './formBits'

/**
 * Un avís proposat: qui l'ha de validar, i els dos botons per fer-ho o no.
 *
 * VIU A DOS LLOCS, i per això és un fitxer: a la fitxa de la persona, entre els
 * seus avisos, i a la llista «Avisos per validar» del rebedor de `/junta`. Les
 * dues han de dir el mateix i oferir els mateixos botons a la mateixa persona,
 * i amb dues còpies una acabaria oferint el que l'altra amaga.
 *
 * ELS BOTONS SÓN ELS QUE LA BASE ACCEPTARÀ. `accionsSobre()` és la regla de
 * `valida_avis()` i `rebutja_avis()` escrita al client: qui l'ha proposat només
 * pot rebutjar-lo. En lloc del botó que
 * falta, la fila diu per què falta.
 *
 * VALIDAR DIU LES CONSEQÜÈNCIES abans de prémer, com el formulari que l'ha
 * proposat: punts, escaló i la notificació al mòbil. És el botó que fa que
 * l'avís passi de debò, i qui el prem és la segona persona que se'l mira.
 *
 * REBUTJAR DEMANA UN MOTIU, com retirar, i és una RPC pròpia: si mentrestant
 * algú altre l'ha validat, `rebutja_avis()` ho diu en comptes de retirar-lo.
 *
 * SENSE XARXA ES QUEDA EN PAUSA I HO DIU, com la retirada de la fitxa. Cap de
 * les dues mutacions escriu a cap cua i no necessiten `networkMode: 'always'`.
 */
export function ValidacioAvis({
  avis,
  jo,
  nombre,
}: {
  readonly avis: AvisRow
  readonly jo: string
  readonly nombre: string
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [obert, setObert] = useState<'valida' | 'rebutja' | null>(null)
  const [nota, setNota] = useState('')

  const accions = accionsSobre(avis, jo)

  const fet = async () => {
    setObert(null)
    setNota('')
    // L'arrel penja la fitxa, el comptador del curs i la llista de proposats.
    await client.invalidateQueries({ queryKey: ['junta', 'avisos'] })
    await client.invalidateQueries({ queryKey: profileScreenKeys.points(avis.user_id) })
    await client.invalidateQueries({ queryKey: ['ranking'] })
  }

  const valida = useMutation({ mutationFn: () => validaAvis(avis.id), onSuccess: fet })
  const rebutja = useMutation({
    mutationFn: () => rebutjaAvis(avis.id, nota.trim()),
    onSuccess: fet,
  })

  // Qui el rep no el veu mai aquí: la política li amaga els proposats contra
  // ell encara que sigui de la junta.
  const qui =
    avis.created_by === jo ? t('junta.soci.avisos.proposatPerMi') : t('junta.soci.avisos.proposat')

  return (
    <div className="mt-4">
      <p className="text-sm font-bold text-warning [text-wrap:pretty]">{qui}</p>

      {obert === null ? (
        accions.valida || accions.rebutja ? (
          <div className="mt-3 flex flex-wrap gap-x-6">
            {accions.valida ? (
              <button
                type="button"
                onClick={() => {
                  setObert('valida')
                }}
                className="-ml-4 min-h-[44px] px-4 text-sm font-bold text-fg [text-wrap:balance]"
              >
                {t('junta.soci.avisos.valida')}
              </button>
            ) : null}
            {accions.rebutja ? (
              <button
                type="button"
                onClick={() => {
                  setObert('rebutja')
                  setNota('')
                }}
                className={
                  'min-h-[44px] px-4 text-sm font-bold text-warning [text-wrap:balance] ' +
                  (accions.valida ? '' : '-ml-4')
                }
              >
                {t('junta.soci.avisos.rebutja')}
              </button>
            ) : null}
          </div>
        ) : null
      ) : obert === 'valida' ? (
        <Confirm
          className="mt-5"
          cta={t('junta.soci.avisos.validaCta')}
          cancel={t('actions.cancel')}
          busy={valida.isPending}
          onConfirm={() => {
            valida.mutate()
          }}
          onCancel={() => {
            setObert(null)
          }}
        >
          <p className="text-sm text-fg-secondary [text-wrap:pretty]">
            {avis.punts === 0
              ? t('junta.soci.avisos.validaSureSensePunts', { nombre })
              : // En valor absolut, com al formulari: «es restaran -25» és un
                // doble negatiu que es llegeix com una suma.
                t('junta.soci.avisos.validaSurePunts', {
                  nombre,
                  punts: String(Math.abs(avis.punts)),
                })}
          </p>
        </Confirm>
      ) : (
        <Confirm
          className="mt-5"
          cta={t('junta.soci.avisos.rebutja')}
          cancel={t('actions.cancel')}
          busy={rebutja.isPending}
          disabled={!notaValida(nota)}
          onConfirm={() => {
            rebutja.mutate()
          }}
          onCancel={() => {
            setObert(null)
            setNota('')
          }}
        >
          <p className="text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
            {t('junta.soci.avisos.rebutjaSure', { nombre })}
          </p>
          <textarea
            value={nota}
            onChange={(e) => {
              setNota(e.target.value)
            }}
            rows={2}
            maxLength={500}
            aria-label={t('junta.soci.avisos.rebutjaNote')}
            placeholder={t('junta.soci.avisos.rebutjaPlaceholder')}
            className={`${INPUT} resize-y`}
          />
        </Confirm>
      )}

      {valida.isPaused || rebutja.isPaused ? (
        <p role="status" className="pt-4 text-sm font-bold text-warning [text-wrap:pretty]">
          {t('junta.soci.avisos.paused')}
        </p>
      ) : null}

      {valida.isError || rebutja.isError ? (
        <p role="alert" className="pt-4 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(valida.error ?? rebutja.error))}
        </p>
      ) : null}
    </div>
  )
}
