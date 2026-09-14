import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { useUserId } from '@/features/session/useUserId'
import { formatDayMonth, formatHores, horesParts } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { fetchHores, profileScreenKeys } from './api'
import { type HoresFila, notesDeLaFila } from './hores'

/**
 * Les hores del curs, al perfil.
 *
 * VA DESPRÉS DE LES INSÍGNIES I NO ENTREMIG. El comentari de `ProfileScreen` ja
 * diu l'ordre: la ratxa i les insígnies diuen com estàs ara, i el que ve a sota
 * és el que has fet. Les hores són el que has fet, amb la seva pròpia llista de
 * files, i posades aquí queden just a sobre de la dels punts, amb la mateixa
 * forma de fila.
 *
 * NO DESAPAREIX AMB ZERO HORES, a diferència de la ratxa. La ratxa és un premi;
 * això és un registre que algú pot necessitar per a la universitat, i un bloc
 * que no hi és no es pot preguntar.
 *
 * PROVISIONAL ES DIU DUES VEGADES: una línia ambre sota el total i un sufix a la
 * fila. Partir la xifra gran en dues es va descartar —el número de dalt és el
 * que la gent ve a veure, i partir-lo obliga a sumar mentalment. Amb zero
 * pendents no surt cap de les dues marques.
 *
 * I EL VERMELL NO HI SURT MAI: és la marca de la comi i aquí no hi ha res que
 * hagi anat malament. Res de verd tampoc; el verd, en aquesta pantalla, són
 * punts.
 */

const GUTTER = 'px-[var(--ds-gutter)]'
const ROW = 'flex items-center gap-3 border-b border-surface-4 py-[15px]'
const NOTE = 'mt-4 text-sm-lo text-fg-muted-lo [text-wrap:pretty]'

export function HoresCard() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const userId = useUserId()

  const hores = useQuery({
    queryKey: profileScreenKeys.hores(userId),
    queryFn: fetchHores,
  })

  const dades = hores.data
  const total = dades === undefined ? 0 : dades.minuts
  const { xifra, unitat } = horesParts(total, locale)

  // La finestra del curs, dita amb una fletxa i no amb una preposició: en
  // català «des de» es contreu amb l'article de la data («de l'1», «del 3») i
  // una cadena interpolada no ho pot saber. La fletxa és la mateixa que la zona
  // junta fa servir per a l'horari d'una activitat.
  const desDe = dades?.des_de ?? null
  const finsA = dades?.fins_a ?? null
  const finestra =
    desDe === null
      ? t('hores.always')
      : t('hores.window', {
          des: formatDayMonth(new Date(desDe), locale),
          fins: finsA === null ? t('hores.today') : formatDayMonth(new Date(finsA), locale),
        })

  const quantes = dades?.quantes ?? 0
  const sub = [quantes > 0 ? t('hores.activities', { count: quantes }) : null, finestra]
    .filter((part): part is string => part !== null)
    .join(' · ')

  return (
    <section className={`pt-12 ${GUTTER}`}>
      <h2 className="eyebrow text-fg-muted">{t('hores.title')}</h2>

      {hores.isError ? (
        <p role="alert" className="mt-5 text-sm font-semibold text-error [text-wrap:pretty]">
          {t(errorKey(hores.error))}
        </p>
      ) : dades === undefined ? (
        <HoresSkeleton />
      ) : (
        <>
          <div className="flex items-center gap-7 border-b border-surface-4 pt-6 pb-7">
            <p
              className={
                'display tabular flex-none tracking-[-0.05em] leading-[0.9] ' +
                (total === 0 ? 'text-fg-faint' : '')
              }
            >
              <span className="text-d-lg">{xifra}</span>
              <span className="ml-3 text-d-sm">{unitat}</span>
            </p>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold [text-wrap:pretty]">
                {/* «Cap hora» va amb el zero i no amb la llista buida: hi ha el
                    cas d'una activitat de la qual encara no se saben les hores
                    d'algú, que té fila i suma zero. */}
                {total === 0 ? t('hores.none') : t('hores.label')}
              </p>
              <p className="mt-[3px] text-sm-lo text-fg-muted-lo [text-wrap:pretty]">{sub}</p>
              {dades.minuts_provisionals > 0 ? (
                <p className="mt-[5px] text-sm font-bold text-warning-deep [text-wrap:pretty]">
                  {t('hores.pending', { h: formatHores(dades.minuts_provisionals, locale) })}
                </p>
              ) : null}
            </div>
          </div>

          {quantes === 0 ? (
            <p className="py-8 text-md text-fg-muted [text-wrap:pretty]">{t('hores.empty')}</p>
          ) : (
            // Totes, sense tallar. Sense una pantalla de detall, un «veure'n
            // més» seria un carrer sense sortida, i el sostre real són vint-i-
            // cinc o trenta activitats per curs.
            <ul>
              {dades.files.map((fila) => (
                <Fila key={fila.event_id} fila={fila} />
              ))}
            </ul>
          )}

          {/* Amb la llista buida, la frase de sobre ja diu què compta: repetir-ho
              aquí seria dir dues vegades la mateixa cosa en quatre línies. */}
          <p className={NOTE}>{quantes === 0 ? t('hores.signed') : t('hores.note')}</p>
        </>
      )}
    </section>
  )
}

function Fila({ fila }: { readonly fila: HoresFila }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const notes = notesDeLaFila(fila)
  const desconegut = fila.minuts === null

  return (
    <li className={ROW}>
      <p className="w-[52px] flex-none text-sm-lo font-semibold text-fg-dim">
        {formatDayMonth(new Date(fila.starts_at), locale)}
      </p>
      <div className="min-w-0 flex-1">
        <p className="text-base [text-wrap:pretty]">{fila.titol ?? t(`eventType.${fila.tipo}`)}</p>
        {notes.length === 0 ? null : (
          <p className="mt-[3px] text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
            {notes.map((nota, i) => (
              <span key={nota}>
                {i === 0 ? '' : ' · '}
                <span
                  className={nota === 'reunio' ? '' : 'font-bold text-warning-deep'}
                >{t(`hores.nota.${nota}`)}</span>
              </span>
            ))}
          </p>
        )}
      </div>
      {/* Un guionet i no un zero: «no ho sabem» i «no hi va fer res» són dues
          coses diferents, i la de sota ja diu quina de les dues és. */}
      <p
        className={
          'tabular flex-none text-base font-extrabold ' + (desconegut ? 'text-fg-faint' : '')
        }
      >
        {desconegut ? '—' : formatHores(fila.minuts ?? 0, locale)}
      </p>
    </li>
  )
}

/** La xifra gran amb la seva línia, i tres files. */
function HoresSkeleton() {
  return (
    <Skeleton>
      <div className="flex items-center gap-7 border-b border-surface-4 pt-6 pb-7">
        <SkeletonBar w="w-[86px]" h="h-[40px]" className="flex-none" />
        <div className="min-w-0 flex-1">
          <SkeletonBar w="w-[60%]" h="h-[14px]" />
          <SkeletonBar w="w-[80%]" h="h-[10px]" className="mt-3" />
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className={ROW}>
          <SkeletonBar w="w-[44px]" h="h-[11px]" className="flex-none" />
          <div className="min-w-0 flex-1">
            <SkeletonBar w="w-[65%]" h="h-[13px]" />
          </div>
          <SkeletonBar w="w-[48px]" h="h-[13px]" className="flex-none" />
        </div>
      ))}
    </Skeleton>
  )
}
