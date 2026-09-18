import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { LIMIT_PUNTS, fetchPointsOf, profileScreenKeys } from '@/features/profile/api'
import { LEDGER_ROW } from '@/features/profile/ledger'
import { LedgerRow } from '@/features/profile/LedgerRow'
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
 * I PER AIXÒ EL TOTAL DIU DE QUÈ ÉS. Aquest és la suma de TOTES les files, i
 * el del rànquing és el del període —«Tot el curs» no inclou l'agost—. Qui ve
 * aquí ve amb un número al cap, i trobar-ne un altre sense cap etiqueta fa
 * pensar que l'app es contradiu quan el que passa és que compten coses
 * diferents. DESCARTAT: retallar aquest total al període del rànquing, que
 * hauria fet quadrar els dos números a canvi de deixar-ne un que no és la suma
 * de les files que hi ha a sota —la contradicció seria la mateixa, dins d'una
 * sola pantalla i sense cap manera de veure-la.
 *
 * I DIU TAMBÉ QUAN NO HI CAPEN. `fetchPointsOf` en baixa 200 com a màxim, i
 * una suma de 200 files quan n'hi ha 300 és un número fals a la pantalla que
 * serveix per quadrar-los. Mentre no hi hagi paginació, quan la llista arriba
 * al topall es diu.
 *
 * LA CLAU DE CACHE ÉS LA DEL PERFIL i no una de `['junta', …]`. És la mateixa
 * consulta sobre la mateixa persona, i compartir-la vol dir que un ajust fet
 * aquí també refresca el perfil de qui l'ha fet quan l'ajust és seu. Dues
 * claus serien dues còpies de la mateixa cosa amb la seva pròpia edat.
 *
 * UNA CORRECCIÓ NO ESBORRA RES. `points_log` és append-only, així que un -20
 * surt a sota del +20 i tots dos es queden. Es pinten amb colors diferents
 * perquè la diferència es vegi de lluny, no per assenyalar ningú.
 *
 * LA FILA LA PINTA `LedgerRow`, que és la mateixa que el perfil del soci. Aquí
 * n'hi havia una còpia, i les dues ja s'havien separat en tres coses —
 * l'alineació, el motiu sota el títol i la mida de la nota—. Aquesta pantalla i
 * la del soci ensenyen la mateixa fila a dues persones que en parlaran entre
 * elles.
 */

export function MemberLedgerBlock({ userId }: { readonly userId: string }) {
  const { t } = useTranslation()

  const points = useQuery({
    queryKey: profileScreenKeys.points(userId),
    queryFn: () => fetchPointsOf(userId),
  })

  const rows = points.data ?? []
  const total = rows.reduce((sum, row) => sum + row.puntos, 0)
  const retallat = rows.length >= LIMIT_PUNTS

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

      {points.isSuccess && rows.length > 0 ? (
        <p className="pt-3 text-sm text-fg-muted [text-wrap:pretty]">
          {retallat
            ? t('junta.soci.ledger.totalCapped', { linies: LIMIT_PUNTS })
            : t('junta.soci.ledger.totalSub')}
        </p>
      ) : null}

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
            <LedgerRow key={row.id} row={row} />
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
        <div key={i} className={LEDGER_ROW}>
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
