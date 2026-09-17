import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { MemberLink } from '@/features/member/MemberLink'
import { memberSubtitle } from '@/features/member/subtitle'
import { fetchProfile, profileKeys } from '@/features/session/profile'
import { errorKey } from '@/lib/errors'
import type { Escola } from '@/lib/model'
import { Chevron } from '@/ui/Chevron/Chevron'
import { PersonHead, PersonHeadSkeleton } from '@/ui/PersonHead/PersonHead'
import { ROW, RowBody } from '@/ui/Row/Row'

import { AdjustPointsBlock } from './AdjustPointsBlock'
import { AvisosBlock } from './AvisosBlock'
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
 * marxat continua sent una cosa que s'ha de poder fer. Per això la baixa surt
 * a la línia de sota el nom i no tanca la pantalla, que és el contrari del que
 * fa `/soci/:id`: allà el perfil és públic i qui ha plegat no en té.
 *
 * LA CAPÇALERA ÉS LA MATEIXA QUE LES ALTRES DUES. `ui/PersonHead` pinta la
 * cara, el nom i la línia de sota al teu perfil, al perfil públic d'un soci i
 * aquí; el que canvia és el final de la línia —allà «soci des de 2024», aquí
 * «De baixa»— i el rètol del càrrec, que només surt en aquesta. La cara feia
 * 56px aquí i 72 a les altres dues, i qui obre aquesta fitxa ve gairebé sempre
 * de veure la mateixa persona a l'altra pantalla.
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
          <PersonHeadSkeleton />
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
            <PersonHead
              src={dades.avatar_url}
              nombre={dades.nombre}
              subtitle={subtitle}
              aside={
                dades.role === 'member' ? null : (
                  <span className="eyebrow flex-none text-brand-label">
                    {t(`junta.role.${dades.role}`)}
                  </span>
                )
              }
            />

            {/* LA PORTA CAP AL PERFIL PÚBLIC. Aquesta fitxa i `/soci/:id` parlen
                de la mateixa persona i no s'enllaçaven en cap direcció: qui
                acaba de restar-li vint punts a algú no tenia manera de veure què
                en veu la resta de socis sense escriure la ruta a mà.
                VA A DALT i no al final, al contrari que la porta de tornada: el
                que hi ha sota d'aquesta línia són tres blocs de coses que es
                fan a algú, i «mira primer qui és» és una fila que val la pena
                llegir abans i no després.
                ÉS UN `MemberLink` i no un `<Link>`: allà la fletxa de tornar ha
                de dir d'on s'ha vingut, i qui ho sap fer és aquell component. */}
            <MemberLink
              userId={userId}
              label={t('junta.soci.backLabel')}
              className={`${ROW} mt-9 border-t border-surface-4 no-underline`}
            >
              <RowBody
                title={t('junta.soci.publicProfile')}
                sub={t('junta.soci.publicProfileSub')}
              />
              <Chevron />
            </MemberLink>

            <MemberLedgerBlock userId={userId} />
            <AdjustPointsBlock userId={userId} nombre={dades.nombre} />
            <AvisosBlock userId={userId} nombre={dades.nombre} />
          </>
        )}
      </div>
    </main>
  )
}
