import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InviteCodeSheet } from './InviteCodeSheet'
import { useAccess } from './useMyProfile'

/**
 * La línia que ocupa el lloc dels recomptes i dels botons de resposta quan
 * qui mira encara és pendent.
 *
 * No és un segon `PendingBanner`: la banda explica tot l'estat una vegada i
 * aquí només hi ha el que cal a l'altura de la pantalla on es notaria el buit
 * —les places que no hi són, el botó que no hi és— i el camí curt cap al codi.
 * Un botó desactivat, o un d'actiu que respon «això no ho pots fer tu», diu
 * menys que aquesta frase. Només es pinta per a un pendent: una baixa no pot
 * bescanviar res i no se li ofereix.
 */
export function PendingNote({ className = '' }: { readonly className?: string }) {
  const { t } = useTranslation()
  const { pending } = useAccess()
  const [asking, setAsking] = useState(false)

  if (!pending) return null

  return (
    <>
      <div className={className}>
        <p className="text-md-lo leading-[1.4] text-fg-muted [text-wrap:pretty]">
          {t('pending.note')}
        </p>
        <button
          type="button"
          onClick={() => {
            setAsking(true)
          }}
          className="-ml-2 inline-flex min-h-[44px] items-center px-2 text-md-lo font-bold text-brand-label"
        >
          {t('pending.haveCode')}
        </button>
      </div>
      {asking ? (
        <InviteCodeSheet
          onClose={() => {
            setAsking(false)
          }}
        />
      ) : null}
    </>
  )
}
