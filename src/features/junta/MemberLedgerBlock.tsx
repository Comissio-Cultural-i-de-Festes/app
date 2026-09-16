import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { fetchPointsOf, profileScreenKeys } from '@/features/profile/api'
import { formatDayMonth } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

/**
 * D'on surten aquests dos-cents punts.
 *
 * És la pregunta que fins ara només es podia contestar obrint la base de
 * dades, i la contesta una llista: cada fila diu quan, per què, de quina nit i
 * —la meitat que faltava— amb quina nota.
 *
 * FILA PER FILA I NO PER MOTIUS. El perfil del soci ja ensenya el resum per
 * motiu, i per a la junta el resum és justament el que no serveix: qui ve aquí
 * ve a buscar UNA fila, la del 14 de març, i un «muntatge · 4 vegades» no la
 * conté. El total sí que hi és, a dalt, perquè és el número que algú acaba de
 * llegir al rànquing i l'ha fet venir.
 *
 * LA CLAU DE CACHE ÉS LA DEL PERFIL i no una de `['junta', …]`. És la mateixa
 * consulta sobre la mateixa persona, i compartir-la vol dir que un ajust fet
 * aquí també refresca el perfil de qui l'ha fet quan l'ajust és seu. Dues
 * claus serien dues còpies de la mateixa cosa amb la seva pròpia edat.
 *
 * UNA CORRECCIÓ NO ESBORRA RES. `points_log` és append-only, així que un -20
 * surt a sota del +20 i tots dos es queden. Es pinten amb colors diferents
 * perquè la diferència es vegi de lluny, no per assenyalar ningú.
 */

const ROW = 'flex items-start gap-4 border-b border-surface-4 py-[15px]'

export function MemberLedgerBlock({ userId }: { readonly userId: string }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)

  const points = useQuery({
    queryKey: profileScreenKeys.points(userId),
    queryFn: () => fetchPointsOf(userId),
  })

  const rows = points.data ?? []
  const total = rows.reduce((sum, row) => sum + row.puntos, 0)

  return (
    <section className="pt-10">
      <div className="flex items-baseline justify-between gap-6">
        <h2 className="eyebrow text-fg-muted">{t('junta.soci.ledger.title')}</h2>
        {points.isSuccess ? (
          <p className="tabular text-lg font-extrabold">
            {t('junta.soci.ledger.total', { total })}
          </p>
        ) : null}
      </div>

      {points.isPending ? (
        <LedgerSkeleton />
      ) : points.isError ? (
        <p role="alert" className="pt-8 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(points.error))}
        </p>
      ) : rows.length === 0 ? (
        <p className="pt-8 text-md text-fg-muted [text-wrap:pretty]">
          {t('junta.soci.ledger.empty')}
        </p>
      ) : (
        <ul className="mt-2">
          {rows.map((row) => (
            <li key={row.id} className={ROW}>
              <p className="w-[52px] flex-none pt-[2px] text-sm-lo font-semibold text-fg-dim">
                {formatDayMonth(new Date(row.created_at), locale)}
              </p>
              <div className="min-w-0 flex-1">
                <p className="text-base [text-wrap:pretty]">
                  {/* El motiu quan no hi ha títol, que inclou l'esdeveniment
                      encara no revelat: la política el deixa fora i el nom
                      arriba null. */}
                  {row.events?.event_title?.titulo ?? t(`motive.${row.motivo}`)}
                </p>
                {row.events?.event_title?.titulo == null ? null : (
                  <p className="mt-[3px] text-sm-lo text-[var(--ds-text-muted-lo)]">
                    {t(`motive.${row.motivo}`)}
                  </p>
                )}
                {row.nota === null || row.nota === '' ? null : (
                  <p className="mt-[5px] text-sm text-fg-secondary [text-wrap:pretty]">
                    {row.nota}
                  </p>
                )}
              </div>
              <p
                className={
                  'tabular flex-none pt-[2px] text-base font-extrabold ' +
                  (row.puntos < 0 ? 'text-[var(--ds-warning)]' : 'text-success')
                }
              >
                {row.puntos > 0 ? '+' : ''}
                {row.puntos}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Quatre files amb la forma de les de debò.
 *
 * Les classes són les de la fila, copiades: una silueta que s'assembla de
 * lluny torna a moure-ho tot quan arriben les dades, que és el salt que la
 * silueta havia d'evitar.
 */
function LedgerSkeleton() {
  return (
    <Skeleton className="mt-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={ROW}>
          <SkeletonBar w="w-[42px]" h="h-[11px]" className="mt-[2px] flex-none" />
          <div className="min-w-0 flex-1">
            <SkeletonBar w="w-[58%]" h="h-[14px]" />
            <SkeletonBar w="w-[36%]" h="h-[10px]" className="mt-3" />
          </div>
          <SkeletonBar w="w-[30px]" h="h-[14px]" className="mt-[2px] flex-none" />
        </div>
      ))}
    </Skeleton>
  )
}
