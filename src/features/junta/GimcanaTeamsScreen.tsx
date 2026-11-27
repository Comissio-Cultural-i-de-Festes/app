import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { fetchGimcanaRow, gimcanaKeys } from '@/features/gimcana/api'
import { errorKey } from '@/lib/errors'

import { GimcanaTeamsBlock } from './GimcanaTeamsBlock'
import { JuntaHeader } from './JuntaHeader'

/**
 * Qui va a cada equip de la gimcana.
 *
 * UNA PANTALLA PRÒPIA I NO UN BLOC DEL FORMULARI. El formulari de la gimcana
 * té un «Publica-la» que desa i torna enrere; aquí cada toc es desa sol. Tots
 * dos a la mateixa pantalla feien dubtar si calia prémer el botó de baix
 * després de repartir quaranta persones, i qui el premia sortia de la pantalla.
 *
 * Serveix per als tres modes que tenen equips de debò: la junta els fa,
 * corregeix un sorteig, o arregla qui s'ha equivocat triant. En mode escoles
 * l'equip surt del perfil i aquí no hi ha res a fer.
 */
export function GimcanaTeamsScreen() {
  const { t } = useTranslation()
  const { id = '' } = useParams()

  const row = useQuery({
    queryKey: gimcanaKeys.row(id),
    queryFn: () => fetchGimcanaRow(id),
    enabled: id !== '',
  })

  const header = (
    <JuntaHeader
      viaHistory
      to={`/junta/esdeveniment/${id}/gimcana`}
      label={t('gimcana.title')}
      title={t('junta.gimcana.teamsTitle')}
      className="lg:hidden"
    />
  )

  const gimcana = row.data ?? null

  return (
    <main className="min-h-dvh bg-app pb-10">
      {gimcana !== null && gimcana.mena_equips !== 'escoles' ? (
        <GimcanaTeamsBlock gimcanaId={gimcana.id} eventId={id} header={header} />
      ) : (
        <>
          {header}
          <div className="px-[var(--ds-gutter)] pt-8">
            {row.isPending ? (
              <p className="text-fg-muted">{t('state.loading')}</p>
            ) : row.isError ? (
              <p role="alert" className="text-md font-bold text-error [text-wrap:pretty]">
                {t(errorKey(row.error))}
              </p>
            ) : (
              <>
                <p className="text-md text-fg-muted [text-wrap:pretty]">
                  {gimcana === null ? t('junta.gimcana.noGimcana') : t('junta.gimcana.schoolsNote')}
                </p>
                <Link
                  to={`/junta/esdeveniment/${id}/gimcana`}
                  className="-ml-2 mt-4 inline-flex min-h-[44px] items-center px-2 text-md font-bold text-brand-label"
                >
                  {t('junta.gimcana.toForm')}
                </Link>
              </>
            )}
          </div>
        </>
      )}
    </main>
  )
}
