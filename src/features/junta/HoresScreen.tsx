import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { formatDayMonth, formatHores, horesParts } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { JuntaHeader } from './JuntaHeader'
import { INPUT } from './formBits'
import { type HoresSoci, fetchHoresPendents, fetchHoresSocis, horesKeys } from './horesApi'

/**
 * El recompte del curs, soci per soci. El que va a la memòria.
 *
 * DOS NÚMEROS A DALT I PROU: les hores de l'associació i quants socis en tenen.
 * Passen el filtre del tauler —«un número que no en canvia cap no hi hauria de
 * ser»— perquè el primer és el que la junta acaba dient a la universitat.
 *
 * AMB CERCADOR, perquè la feina real d'aquesta pantalla és «quantes hores porta
 * en Tal» quan en Tal ho pregunta, i buscar-lo a ull entre dues-centes files és
 * el fracàs.
 *
 * NO S'ENTRA A NINGÚ i les files no són enllaços. El desglossament d'una
 * persona ja existeix: és el seu propi bloc del perfil. Fer-ne una còpia aquí
 * voldria dir una consulta nova, una pantalla nova i un segon lloc on la
 * mateixa llista pot derivar. El que la junta necessita d'una fila —el total i
 * si en queda res per visar— ja hi és, i quan la pregunta és «de quines
 * activitats?», la resposta viu a l'activitat, que és on es corregeix igualment.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

export function HoresScreen() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const [busca, setBusca] = useState('')

  const socis = useQuery({ queryKey: horesKeys.socis(), queryFn: fetchHoresSocis })
  const pendents = useQuery({ queryKey: horesKeys.pendents(), queryFn: fetchHoresPendents })

  const files = socis.data ?? []
  const totalMinuts = files.reduce((n, f) => n + f.minuts, 0)
  const ambHores = files.filter((f) => f.minuts > 0).length
  const total = horesParts(totalMinuts, locale)

  const cerca = busca.trim().toLocaleLowerCase(locale)
  const vistes = cerca === '' ? files : files.filter((f) => f.nombre.toLocaleLowerCase(locale).includes(cerca))

  return (
    <main className="min-h-dvh bg-app pb-[calc(var(--ds-safe-bottom)+32px)]">
      <JuntaHeader
        to="/junta"
        label={t('junta.back')}
        title={t('junta.hores.title')}
        className="lg:hidden"
      />

      <p className={`pt-8 text-md text-fg-secondary [text-wrap:pretty] ${GUTTER}`}>
        {t('junta.hores.summaryLede')}
      </p>

      {socis.isError ? (
        <p role="alert" className={`pt-10 text-md font-bold text-error [text-wrap:pretty] ${GUTTER}`}>
          {t(errorKey(socis.error))}
        </p>
      ) : socis.isPending ? (
        <HoresSkeleton />
      ) : (
        <>
          <section className="mt-8 grid grid-cols-2 border-y border-surface-7">
            <div className="px-10 py-8">
              <p
                className={
                  'display tabular tracking-[-0.045em] ' +
                  (totalMinuts === 0 ? 'text-fg-faint' : '')
                }
              >
                <span className="text-d-md">{total.xifra}</span>
                <span className="ml-3 text-d-sm">{total.unitat}</span>
              </p>
              <p className="eyebrow mt-[3px] text-fg-dim">{t('junta.hores.totalCourse')}</p>
            </div>
            <div className="border-l border-surface-7 px-10 py-8">
              <p
                className={
                  'display tabular text-d-md tracking-[-0.045em] ' +
                  (ambHores === 0 ? 'text-fg-faint' : '')
                }
              >
                {String(ambHores)}
              </p>
              <p className="eyebrow mt-[3px] text-fg-dim">{t('junta.hores.withHours')}</p>
            </div>
          </section>

          {files.length === 0 ? (
            <p className={`py-10 text-md text-fg-muted [text-wrap:pretty] ${GUTTER}`}>
              {t('junta.hores.summaryEmpty')}
            </p>
          ) : (
            <>
              {/* La feina, i el camí per anar-hi. Al formulari d'una activitat
                  passada no s'hi arriba des de cap altre lloc, així que sense
                  aquesta llista el visat era una pantalla sense porta. */}
              {(pendents.data?.activitats ?? 0) > 0 ? (
                <section className={`pt-6 ${GUTTER}`}>
                  <p className="text-sm font-bold text-warning-deep [text-wrap:pretty]">
                    {t('junta.hores.pendingWork', {
                      count: pendents.data?.activitats ?? 0,
                      h: formatHores(pendents.data?.minuts ?? 0, locale),
                    })}
                  </p>
                  <ul className="mt-5">
                    {(pendents.data?.files ?? []).map((fila) => (
                      <li key={fila.event_id}>
                        <Link
                          to={`/junta/esdeveniment/${fila.event_id}/hores`}
                          className="flex min-h-[62px] items-center gap-3 border-b border-surface-4 py-5 text-fg no-underline"
                        >
                          <span className="w-[52px] flex-none text-sm-lo font-semibold text-fg-dim">
                            {formatDayMonth(new Date(fila.starts_at), locale)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-bold [text-wrap:pretty]">
                              {fila.titol ?? '—'}
                            </span>
                            <span className="mt-[3px] block text-sm-lo text-fg-muted-lo">
                              {[
                                t('junta.hores.people', { count: fila.persones }),
                                formatHores(fila.minuts, locale),
                              ].join(' · ')}
                            </span>
                          </span>
                          <span aria-hidden="true" className="flex-none text-lg text-fg-muted">
                            ›
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <div className={`pt-6 ${GUTTER}`}>
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value)
                  }}
                  placeholder={t('junta.hores.search')}
                  aria-label={t('junta.hores.search')}
                  className={INPUT}
                />
              </div>

              {vistes.length === 0 ? (
                <p className={`py-10 text-md text-fg-muted [text-wrap:pretty] ${GUTTER}`}>
                  {t('junta.hores.noMatch')}
                </p>
              ) : (
                <ul className="pt-8">
                  {vistes.map((soci) => (
                    <Fila key={soci.user_id} soci={soci} />
                  ))}
                </ul>
              )}

              <p className={`pt-8 text-sm-lo text-fg-muted-lo [text-wrap:pretty] ${GUTTER}`}>
                {t('junta.hores.summaryNote')}
              </p>
            </>
          )}
        </>
      )}
    </main>
  )
}

function Fila({ soci }: { readonly soci: HoresSoci }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)

  const on = [
    soci.escola === null ? null : t(`escolaShort.${soci.escola}`),
    soci.curs === null ? null : t(`onboarding.year.${String(soci.curs)}`),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')

  return (
    <li
      className={`flex min-h-[64px] flex-wrap items-center gap-5 border-b border-surface-4 py-6 ${GUTTER}`}
    >
      <Avatar src={soci.avatar_url} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold text-fg">{soci.nombre}</span>
        {on === '' ? null : (
          <span className="mt-1 block text-sm-lo text-fg-muted-lo">{on}</span>
        )}
      </span>
      <span className="flex-none text-right">
        <span className="tabular block text-lg font-extrabold">
          {formatHores(soci.minuts, locale)}
        </span>
        <span className="mt-1 block text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
          {t('junta.hores.activities', { count: soci.quantes })}
          {soci.minuts_provisionals > 0 ? (
            <>
              {' · '}
              <span className="font-bold text-warning-deep">
                {t('junta.hores.toSign', { h: formatHores(soci.minuts_provisionals, locale) })}
              </span>
            </>
          ) : null}
        </span>
      </span>
    </li>
  )
}

/** Els dos números de dalt i cinc files. */
function HoresSkeleton() {
  return (
    <Skeleton className="mt-8">
      <div className="grid grid-cols-2 border-y border-surface-7">
        {[0, 1].map((i) => (
          <div key={i} className="px-10 py-8">
            <SkeletonBar w="w-[92px]" h="h-[34px]" />
            <SkeletonBar w="w-[70px]" h="h-[9px]" className="mt-3" />
          </div>
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={`flex items-center gap-5 border-b border-surface-4 py-6 ${GUTTER}`}>
          <SkeletonBar w="w-[40px]" h="h-[40px]" className="flex-none rounded-round" />
          <div className="min-w-0 flex-1">
            <SkeletonBar w="w-[45%]" h="h-[15px]" />
            <SkeletonBar w="w-[30%]" h="h-[10px]" className="mt-3" />
          </div>
          <SkeletonBar w="w-[56px]" h="h-[15px]" className="flex-none" />
        </div>
      ))}
    </Skeleton>
  )
}
