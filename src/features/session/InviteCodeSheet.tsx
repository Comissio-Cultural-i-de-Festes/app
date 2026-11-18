import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DbError } from '@/lib/db'
import { errorKey } from '@/lib/errors'
import { rpc } from '@/lib/supabase'
import { Button } from '@/ui/Button/Button'
import { TextField } from '@/ui/Field/Field'
import { Sheet, SheetClose } from '@/ui/Sheet/Sheet'

/**
 * Bescanviar un codi d'invitació quan ja has entrat.
 *
 * `EntryScreen` ja en bescanvia un, però només el que viatja per la URL: la
 * junta enganxa l'enllaç al grup i qui el toca entra amb el codi a sobre. Qui
 * arriba abans que l'enllaç, o el perd, o entra pel botó de Google i prou, es
 * queda pendent i no té enlloc on escriure'l. `redeem_invite` sempre hi era; el
 * que faltava era un camp.
 *
 * NO DIU PER QUÈ HA FALLAT. `invite_preview` contesta igual als quatre motius
 * —no ha existit mai, revocat, gastat, caducat— precisament perquè un codi no
 * es pugui sondejar; dir-ho aquí desfaria això. El que sí que es diu és que ha
 * fallat i què fer, que és tot el que la persona pot accionar.
 *
 * S'INVALIDA TOTA LA CAU, no només el perfil. `redeem_invite` mou `estat` a
 * `'actiu'` dins de la base, i tota l'aplicació llegeix aquell camp de la fila
 * i no del token —un JWT emès abans de l'alta encara diria `pendent` durant
 * una hora—, però el perfil no és l'únic que canvia: les assistències, el
 * rànquing i els punts de les escoles es van llegir com a pendent i la RLS els
 * va tornar buits, i amb un minut de `staleTime` la pantalla diria «hi van 0»
 * a qui acaba d'entrar. L'opció més estreta, enumerar les claus, es deixaria la
 * primera que algú afegeixi.
 */

interface RedeemResult {
  readonly ok: boolean
  readonly motiu?: string
}

/** Un codi que el servidor no vol. No és un error de xarxa i no és un 42501. */
class BadCode extends Error {
  constructor() {
    super('invite refused')
    this.name = 'BadCode'
  }
}

export function InviteCodeSheet({ onClose }: { readonly onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fieldId = useId()
  const [code, setCode] = useState('')

  const redeem = useMutation({
    mutationFn: async (codi: string) => {
      const { data, error } = await rpc<RedeemResult>('redeem_invite', { p_codi: codi })
      if (error) throw new DbError(error)
      // La RPC no aixeca per un codi que no val: torna `{ok: false}`. Tractar
      // l'absència d'error com un èxit deixaria el full tancant-se en fals i
      // la persona igual de pendent, sense res escrit a la pantalla.
      if (data?.ok !== true) throw new BadCode()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      onClose()
    },
  })

  const trimmed = code.trim()

  return (
    <Sheet label={t('pending.codeTitle')} onClose={onClose}>
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <p className="display text-d-xs leading-[1.05] tracking-[-0.04em] [text-wrap:balance]">
            {t('pending.codeTitle')}
          </p>
          <p className="mt-4 text-sm leading-[1.4] text-fg-muted [text-wrap:pretty]">
            {t('pending.codeBody')}
          </p>
        </div>
        <SheetClose onClose={onClose} />
      </div>

      <form
        className="mt-9"
        onSubmit={(e) => {
          e.preventDefault()
          if (trimmed !== '') redeem.mutate(trimmed)
        }}
        noValidate
      >
        <TextField
          id={fieldId}
          label={t('pending.codeLabel')}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('pending.codePlaceholder')}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          required
        />

        <div className="mt-6">
          <Button type="submit" disabled={trimmed === '' || redeem.isPending}>
            {redeem.isPending ? t('pending.codeSending') : t('pending.codeCta')}
          </Button>
        </div>
      </form>

      {/* Dues coses diferents amb la mateixa cara: el codi no val, o la
          petició no ha arribat. `redeem_invite` també aixeca un 42501 quan la
          invitació s'ha exhaurit entremig, i des d'aquí això és el mateix cas
          que un codi dolent —el que la persona ha de fer és demanar-ne un
          altre— així que hi va la mateixa frase. */}
      {redeem.error ? (
        <p role="alert" className="mt-5 text-md font-bold text-error [text-wrap:pretty]">
          {redeem.error instanceof BadCode ||
          (redeem.error instanceof DbError && redeem.error.code === '42501')
            ? t('pending.codeBad')
            : t(errorKey(redeem.error))}
        </p>
      ) : null}
    </Sheet>
  )
}
