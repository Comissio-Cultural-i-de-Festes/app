import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useUserId } from '@/features/session/useUserId'
import { formatDayMonth } from '@/i18n/format'
import { type Locale, toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { clauGravetat, nomDelTipus } from './avisTipus'
import { type AvisProposat, avisosKeys, fetchAvisTipus, fetchProposats } from './avisosApi'
import { ValidacioAvis } from './ValidacioAvis'

/**
 * Els avisos que esperen una segona persona, al rebedor de `/junta`.
 *
 * AQUÍ I NO NOMÉS A LA FITXA. Un avís proposat no compta fins que algú altre de
 * la junta el valida (migració 93), i si l'únic lloc on es veiés fos la fitxa de
 * la persona, s'hi quedaria esperant fins que algú hi entrés per casualitat. El
 * rebedor és on la junta mira què hi ha per fer, i el número de «Hi ha feina»
 * hi porta.
 *
 * TAMBÉ ELS QUE HAS PROPOSAT TU, amb «L'has proposat tu» i el botó de
 * rebutjar-lo: qui ha proposat un avís és qui més vol saber si ja l'ha validat
 * algú. ELS QUE ET PROPOSEN A TU NO HI SURTEN: la política d'`avisos` els amaga
 * a qui els rep fins que algú altre els valida, sigui o no de la junta.
 *
 * EL NOM PORTA A LA FITXA, que és on hi ha l'històric de la persona: qui valida
 * un avís hauria de mirar abans què porta.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function AvisosProposatsBlock() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const jo = useUserId()

  const proposats = useQuery({ queryKey: avisosKeys.proposats(), queryFn: fetchProposats })
  const cataleg = useQuery({ queryKey: avisosKeys.tipus(), queryFn: fetchAvisTipus })

  const tipusNom = (clau: string): string => {
    const row = cataleg.data?.find((r) => r.clau === clau)
    if (row === undefined) return clau
    return nomDelTipus(row, i18n.exists(`avisos.tipus.${clau}`) ? t(`avisos.tipus.${clau}`) : '')
  }

  if (proposats.isPending) {
    return (
      <Skeleton className={`mt-6 ${GUTTER}`}>
        <SkeletonBar w="w-[40%]" h="h-[14px]" />
        <SkeletonBar w="w-[70%]" h="h-[11px]" className="mt-3" />
      </Skeleton>
    )
  }

  if (proposats.isError) {
    return (
      <p role="alert" className={`pt-6 text-md font-bold text-error ${GUTTER}`}>
        {t(errorKey(proposats.error))}
      </p>
    )
  }

  if (proposats.data.length === 0) {
    return (
      <p className={`pt-6 text-md text-fg-muted [text-wrap:pretty] ${GUTTER}`}>
        {t('junta.proposats.none')}
      </p>
    )
  }

  return (
    <ul className="mt-6">
      {proposats.data.map((avis) => (
        <Fila key={avis.id} avis={avis} jo={jo} tipus={tipusNom(avis.tipus)} locale={locale} />
      ))}
    </ul>
  )
}

function Fila({
  avis,
  jo,
  tipus,
  locale,
}: {
  readonly avis: AvisProposat
  readonly jo: string
  readonly tipus: string
  readonly locale: Locale
}) {
  const { t } = useTranslation()
  const nombre = avis.persona?.nombre ?? '—'
  const dia = formatDayMonth(new Date(avis.created_at), locale)
  const gravetat = clauGravetat(avis.gravetat)

  return (
    <li className={`border-t border-surface-4 py-6 ${GUTTER}`}>
      <div className="flex items-baseline justify-between gap-5">
        <Link
          to={`/junta/socis/${avis.user_id}`}
          className="min-w-0 text-base font-bold text-fg [text-wrap:pretty]"
        >
          {nombre}
        </Link>
        {avis.punts === 0 ? null : (
          <p className="tabular flex-none text-base font-extrabold text-fg-muted">{avis.punts}</p>
        )}
      </div>

      <p className="mt-[3px] text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {[tipus, gravetat === null ? String(avis.gravetat) : t(gravetat)].join(' · ')}
      </p>

      <p className="mt-[5px] text-sm text-fg-secondary [text-wrap:pretty]">{avis.nota}</p>

      <p className="mt-[5px] text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {avis.proposa === null
          ? t('junta.proposats.perSenseNom', { dia })
          : t('junta.proposats.per', { nom: avis.proposa.nombre, dia })}
      </p>

      <ValidacioAvis avis={avis} jo={jo} nombre={nombre} />
    </li>
  )
}
