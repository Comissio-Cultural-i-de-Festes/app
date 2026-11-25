import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { profileKeys } from '@/features/session/profile'
import { errorKey } from '@/lib/errors'
import { Button } from '@/ui/Button/Button'
import { Confirm } from '@/ui/Confirm/Confirm'

import { setExtern } from './externApi'

/**
 * Qui ve de fora, dit per la junta.
 *
 * El primer cop ja deixa que cadascú digui «vinc de fora». Això és per als que
 * van entrar abans que hi fos —i per tant es van inventar una escola— i per
 * corregir qui s'ha equivocat de botó. Una escola inventada suma al rànquing
 * d'escoles i al tauler, i des de fora no es distingeix d'una de veritat:
 * qui ho sap és la junta.
 *
 * AMB CONFIRMACIÓ ELS DOS SENTITS. Marcar esborra l'escola, el grau i el curs,
 * que no es poden refer des d'aquí; desmarcar fa que la persona hagi de tornar
 * a passar pel primer cop. Cap de les dues és greu, però totes dues tenen una
 * conseqüència que no es veu des del botó, i el panell la diu abans.
 *
 * VA AL FINAL DE LA FITXA. Es fa molt poques vegades, i el que hi ha a sobre
 * —el registre, l'ajust i els avisos— és la feina de cada dia.
 */
export function ExternBlock({
  userId,
  extern,
}: {
  readonly userId: string
  readonly extern: boolean
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [obert, setObert] = useState(false)

  const canvia = useMutation({
    mutationFn: () => setExtern(userId, !extern),
    onSuccess: async () => {
      setObert(false)
      await client.invalidateQueries({ queryKey: profileKeys.of(userId) })
      // El rànquing d'escoles i el tauler compten qui té escola.
      await client.invalidateQueries({ queryKey: ['ranking'] })
      await client.invalidateQueries({ queryKey: ['junta'] })
    },
  })

  return (
    <section className="mt-10 border border-surface-8 bg-surface-2 p-9">
      <h2 className="eyebrow text-fg-muted">{t('junta.extern.title')}</h2>
      <p className="mt-4 text-sm text-fg-secondary [text-wrap:pretty]">
        {t(extern ? 'junta.extern.isExtern' : 'junta.extern.isNot')}
      </p>

      {obert ? (
        <Confirm
          className="mt-6"
          cta={t(extern ? 'junta.extern.unmark' : 'junta.extern.mark')}
          cancel={t('actions.cancel')}
          busy={canvia.isPending}
          onConfirm={() => {
            canvia.mutate()
          }}
          onCancel={() => {
            setObert(false)
            canvia.reset()
          }}
        >
          {extern ? (
            <p className="text-sm font-semibold text-fg [text-wrap:pretty]">
              {t('junta.extern.unmarkHint')}
            </p>
          ) : null}
        </Confirm>
      ) : (
        <Button
          variant="secondary"
          className="mt-6"
          onClick={() => {
            setObert(true)
          }}
        >
          {t(extern ? 'junta.extern.unmark' : 'junta.extern.mark')}
        </Button>
      )}

      {canvia.isError ? (
        <p role="alert" className="mt-4 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(canvia.error))}
        </p>
      ) : null}
    </section>
  )
}
