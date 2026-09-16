import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { errorKey } from '@/lib/errors'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { AdjustPointsBlock } from './AdjustPointsBlock'
import { AvisosBlock } from './AvisosBlock'
import { JuntaHeader } from './JuntaHeader'
import { MemberLedgerBlock } from './MemberLedgerBlock'
import { fetchMemberProfile, memberPointsKeys } from './memberPointsApi'

/**
 * El full d'una persona.
 *
 * LA PANTALLA QUE LA DE PUNTS PROMETIA. `door.pointsUndo` deia des del primer
 * dia «si t'equivoques, els pots treure des del perfil de la persona», i aquest
 * perfil no existia: `/junta/socis` era una llista i no hi havia cap ruta cap a
 * dins. La frase era falsa als tres idiomes.
 *
 * EL REGISTRE A SOBRE I L'AJUST A SOTA, en aquest ordre i no al revés. Ningú no
 * ajusta uns punts sense haver mirat abans d'on surten; posar el formulari a
 * dalt és convidar a escriure un -20 sense haver vist que el +20 ja estava
 * corregit.
 *
 * I ELS AVISOS AL FINAL, sota l'ajust i no sobre. Són la cosa més cara que es
 * pot fer des d'aquí —una fila que no s'esborra mai i que la persona llegirà—,
 * i el camí fins al formulari passa a propòsit pel llibre major i per l'ajust,
 * que és la resposta proporcionada a gairebé tot. Qui hi arriba hi arriba havent
 * descartat les altres dues.
 *
 * QUI HI ARRIBA: la ruta penja de `/junta`, o sigui que passa pel mateix porter
 * que la resta. La barrera de debò, però, no és aquesta —és `plog_select_admin`
 * i el fet que `award_points` comprovi `private.is_admin()` ella mateixa. Si
 * algú es planta aquí sense ser de la junta, el que veu és un error, no un
 * llibre major.
 *
 * ELS DONATS DE BAIXA HI SÓN. Donar de baixa no esborra ningú —els punts, les
 * assistències i el rànquing es queden— i corregir un error d'algú que ja ha
 * marxat continua sent una cosa que s'ha de poder fer.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function MemberScreen() {
  const { t } = useTranslation()
  const { id } = useParams()
  const userId = id ?? ''

  const soci = useQuery({
    queryKey: memberPointsKeys.profile(userId),
    queryFn: () => fetchMemberProfile(userId),
    enabled: userId !== '',
  })

  const subtitle = [
    soci.data?.escola == null ? null : t(`escolaShort.${soci.data.escola}`),
    soci.data?.curs == null ? null : t(`onboarding.year.${String(soci.data.curs)}`),
    soci.data?.grau == null || soci.data.grau === '' ? null : soci.data.grau,
    soci.data?.estat === 'baixa' ? t('junta.members.gone') : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')

  return (
    <main className="min-h-dvh bg-app pb-[calc(var(--ds-safe-bottom)+32px)]">
      <JuntaHeader to="/junta/socis" label={t('junta.members.title')} />

      <div className={`pt-8 ${GUTTER}`}>
        {soci.isPending ? (
          <HeadSkeleton />
        ) : soci.isError ? (
          <p role="alert" className="text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(soci.error))}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-6">
              <Avatar src={soci.data.avatar_url} size={56} />
              <div className="min-w-0 flex-1">
                <h1 className="display text-d-s tracking-[-0.045em] [text-wrap:balance]">
                  {soci.data.nombre}
                </h1>
                {subtitle === '' ? null : (
                  <p className="mt-2 text-sm-lo text-[var(--ds-text-muted-lo)]">{subtitle}</p>
                )}
              </div>
              {soci.data.role === 'member' ? null : (
                <span className="eyebrow flex-none text-brand-label">
                  {t(`junta.role.${soci.data.role}`)}
                </span>
              )}
            </div>

            <MemberLedgerBlock userId={userId} />
            <AdjustPointsBlock userId={userId} nombre={soci.data.nombre} />
            <AvisosBlock userId={userId} nombre={soci.data.nombre} />
          </>
        )}
      </div>
    </main>
  )
}

function HeadSkeleton() {
  return (
    <Skeleton>
      <div className="flex items-center gap-6">
        <SkeletonBar w="w-[56px]" h="h-[56px]" className="flex-none rounded-round" />
        <div className="min-w-0 flex-1">
          <SkeletonBar w="w-[58%]" h="h-[26px]" />
          <SkeletonBar w="w-[40%]" h="h-[11px]" className="mt-4" />
        </div>
      </div>
    </Skeleton>
  )
}
