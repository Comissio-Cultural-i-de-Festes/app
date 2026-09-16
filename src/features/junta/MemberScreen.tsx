import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { memberSubtitle } from '@/features/member/subtitle'
import { fetchProfile, profileKeys } from '@/features/session/profile'
import { errorKey } from '@/lib/errors'
import type { Escola } from '@/lib/model'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { AdjustPointsBlock } from './AdjustPointsBlock'
import { JuntaHeader } from './JuntaHeader'
import { MemberLedgerBlock } from './MemberLedgerBlock'

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
 * QUI HI ARRIBA: la ruta penja de `/junta`, o sigui que passa pel mateix porter
 * que la resta. La barrera de debò, però, no és aquesta —és `plog_select_admin`
 * i el fet que `award_points` comprovi `private.is_admin()` ella mateixa. Si
 * algú es planta aquí sense ser de la junta, el que veu és un error, no un
 * llibre major.
 *
 * ELS DONATS DE BAIXA HI SÓN. Donar de baixa no esborra ningú —els punts, les
 * assistències i el rànquing es queden— i corregir un error d'algú que ja ha
 * marxat continua sent una cosa que s'ha de poder fer. Per això la baixa surt
 * a la línia de sota el nom i no tanca la pantalla, que és el contrari del que
 * fa `/soci/:id`: allà el perfil és públic i qui ha plegat no en té.
 *
 * LA FILA ES DEMANA AMB `fetchProfile` I NO AMB UNA CONSULTA PRÒPIA. Aquesta
 * pantalla en tenia una —`fetchMemberProfile`, sota `['junta','soci',id]`— que
 * demanava un subconjunt estricte de les mateixes columnes de la mateixa
 * taula. Eren dues entrades de cache per a la mateixa fila que envellien per
 * separat: canviar-se el nom refrescava la del perfil i deixava la de la junta
 * dient el nom vell fins que caduqués tota sola.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function MemberScreen() {
  const { t } = useTranslation()
  const { id } = useParams()
  const userId = id ?? ''

  const soci = useQuery({
    queryKey: profileKeys.of(userId),
    queryFn: () => fetchProfile(userId),
    enabled: userId !== '',
  })

  const dades = soci.data ?? null
  const subtitle =
    dades === null
      ? ''
      : memberSubtitle({
          escola: dades.escola === null ? null : t(`escolaShort.${dades.escola satisfies Escola}`),
          curs: dades.curs === null ? null : t(`onboarding.year.${String(dades.curs)}`),
          grau: dades.grau,
          cua: dades.estat === 'baixa' ? t('junta.members.gone') : null,
        })

  return (
    <main className="min-h-dvh bg-app pb-[calc(var(--ds-safe-bottom)+32px)]">
      <JuntaHeader to="/junta/socis" label={t('junta.members.title')} className="lg:hidden" />

      <div className={`pt-8 ${GUTTER}`}>
        {soci.isPending ? (
          <HeadSkeleton />
        ) : soci.isError ? (
          <p role="alert" className="text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(soci.error))}
          </p>
        ) : dades === null ? (
          // `fetchProfile` fa `maybeSingle`, o sigui que un id que no existeix
          // arriba com a null i no com a error. Un admin llegeix tota la taula,
          // així que aquí null vol dir que la persona no hi és de debò.
          <p role="alert" className="text-md font-bold text-error [text-wrap:pretty]">
            {t('errors.notFound')}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-6">
              <Avatar src={dades.avatar_url} size={56} />
              <div className="min-w-0 flex-1">
                <h1 className="display text-d-s tracking-[-0.045em] [text-wrap:balance]">
                  {dades.nombre}
                </h1>
                {subtitle === '' ? null : (
                  <p className="mt-2 text-sm-lo text-[var(--ds-text-muted-lo)]">{subtitle}</p>
                )}
              </div>
              {dades.role === 'member' ? null : (
                <span className="eyebrow flex-none text-brand-label">
                  {t(`junta.role.${dades.role}`)}
                </span>
              )}
            </div>

            <MemberLedgerBlock userId={userId} />
            <AdjustPointsBlock userId={userId} nombre={dades.nombre} />
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
