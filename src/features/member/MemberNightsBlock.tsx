import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { formatDateLong } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import type { EventType } from '@/lib/model'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { fetchMemberNights, sociKeys } from './api'
import { sortNights } from './nights'

/**
 * A què ha vingut.
 *
 * ZERO MIGRACIÓ, i val la pena dir per què: `att_select_public_si` ja publica
 * tota fila amb `estado in ('si','asistio')` d'un esdeveniment publicat que no
 * sigui una reunió de junta, i tota columna d'`attendances` és al grant de
 * lectura. O sigui que «on ha estat aquesta persona» era una pregunta que la
 * base contestava des del primer dia i que ningú no havia fet mai —el mateix
 * que deia el comentari de `insideApi.ts` sobre «qui hi ha dins», i aquesta
 * consulta n'és literalment la girada.
 *
 * LES REUNIONS DE JUNTA NO HI SURTEN, i no hi ha cap `if` que ho faci: la
 * política les deixa fora abans que arribin aquí. Un filtre al client seria una
 * segona còpia d'aquella regla, i el dia que divergissin guanyaria la còpia
 * equivocada.
 *
 * NO HI HA FOTOS. Les de sortida de `/perfil/nits` són teves i es queden allà:
 * això és una llista d'on ha estat algú, no un àlbum seu.
 */
export function MemberNightsBlock({ userId }: { readonly userId: string }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)

  const nights = useQuery({
    queryKey: sociKeys.nights(userId),
    queryFn: () => fetchMemberNights(userId),
  })

  const rows = sortNights(nights.data ?? [])

  return (
    <section className="px-[var(--ds-gutter)] pt-12">
      <div className="flex items-baseline justify-between gap-5">
        <h2 className="eyebrow text-fg-muted">{t('member.nights.title')}</h2>
        {nights.data === undefined ? null : (
          <span className="tabular text-sm-lo font-bold text-fg-muted-lo">
            {t('member.nights.count', { count: rows.length })}
          </span>
        )}
      </div>

      {nights.isPending ? (
        // Files i no «Un segon…»: aquest és el bloc més alt de la pantalla i
        // l'últim en arribar, o sigui el que decideix si el peu balla. Tres
        // files és el que hi cap a la primera pantalla d'un mòbil.
        <Skeleton className="mt-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="block border-b border-surface-4 py-[15px]">
              <SkeletonBar w="w-[65%]" h="h-[13px]" />
              <SkeletonBar w="w-[40%]" h="h-[11px]" className="mt-[6px]" />
            </span>
          ))}
        </Skeleton>
      ) : nights.isError ? (
        <p role="alert" className="py-8 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(nights.error))}
        </p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-md text-fg-muted [text-wrap:pretty]">{t('member.nights.empty')}</p>
      ) : (
        <ul className="mt-2">
          {rows.map((night) => (
            <li key={night.event_id}>
              <Link
                to={`/esdeveniment/${night.event_id}`}
                className="flex items-center gap-3 border-b border-surface-4 py-[15px] no-underline"
              >
                <span className="min-w-0 flex-1">
                  {/* Sense títol vol dir que la revelació encara el tapa, cosa
                      que a una activitat passada no passa —però una fila muda
                      és pitjor que la mena de cosa que era. */}
                  <span className="block text-base font-semibold text-fg [text-wrap:pretty]">
                    {night.titol ?? t(`eventType.${night.tipo satisfies EventType}`)}
                  </span>
                  <span className="mt-[3px] block text-sm-lo text-fg-muted-lo">
                    {formatDateLong(new Date(night.starts_at), locale)}
                  </span>
                </span>
                <span aria-hidden="true" className="flex-none text-2xl text-brand-accent">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
