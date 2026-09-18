import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { fetchRanking, periodBounds, rankingKeys } from '@/features/ranking/api'
import { defaultPeriod, usePeriods } from '@/features/ranking/useRanking'
import { formatOrdinal } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'

/**
 * Els punts i la posició d'aquesta persona, del rànquing i d'enlloc més.
 *
 * NO HI HA CAP CONSULTA NOVA i no n'hi ha d'haver: `ranking_period()` ja publica
 * el total i la posició de tot soci actiu, i la clau de React Query és la
 * mateixa que fa servir el Rànquing, així que qui ve d'allà ja la té a la
 * memòria i això no demana res a la xarxa. Una funció nova que tornés els punts
 * d'una persona seria una segona font per a la mateixa xifra, i el dia que el
 * criteri de què compta canviï, en canviaria una.
 *
 * NO HI HA DESGLOSSAMENT PER MOTIU. El teu perfil ensenya «muntatge: 3 vegades,
 * 45 punts»; ensenyar-ho d'un altre és més del que ensenya el rànquing, que
 * només publica el total. I la `nota` d'un ajust manual no pot sortir mai
 * d'aquí: el motiu pel qual la junta va treure punts a algú és per a aquella
 * persona i per a la junta.
 *
 * QUI S'AMAGA DEL RÀNQUING NO HI SURT, I EL PERFIL S'OBRE IGUAL. `ranking_period()`
 * deixa fora tota fila amb `hide_from_ranking`, o sigui que no ser-hi és
 * exactament el senyal i no cal preguntar-ho a `profiles`. Preguntar-ho sí que
 * es podria —el grant de `profiles` és de tota la taula i la columna es
 * llegeix—, però seria una segona font per a la mateixa decisió, i la que mana
 * és la funció: qui no surt de `ranking_period()` no surt, amagat o donat de
 * baixa o encara sense punts, i el bloc els tracta igual a tots tres. El criteri és
 * el de `badge_holders()`: la persona compta i el número no es diu. L'altra
 * opció era que la ruta no obrís, i vol dir que no poder sortir al rànquing
 * passa a ser també no poder ser conegut.
 */
export function MemberStandingBlock({ userId }: { readonly userId: string }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)

  const periods = usePeriods()
  const bounds = periodBounds(defaultPeriod(periods.data))
  const ranking = useQuery({
    queryKey: rankingKeys.individual(bounds),
    queryFn: () => fetchRanking(bounds),
    enabled: periods.isSuccess,
  })

  // UN ERROR NO ÉS UN ZERO, i aquesta és la distinció que la primera versió no
  // feia: amb una sola sortida per a «encara no ha arribat» i «ha petat», un
  // 500 del rànquing deixava la pantalla sense bloc, i el que el soci llegia
  // era «no té posició» —una frase falsa i indistingible de la certa. Per això
  // l'error surt, i surt abans que res.
  //
  // Les dues consultes en un sol avís perquè per a qui mira són una sola cosa:
  // sense períodes no hi ha rànquing —`enabled` el deixa aturat, o sigui
  // «pendent» per sempre— i dos avisos per la mateixa xifra seria dir-ho dues
  // vegades.
  if (periods.isError || ranking.isError) {
    return (
      <p
        role="alert"
        className="px-[var(--ds-gutter)] pt-8 text-md font-bold text-error [text-wrap:pretty]"
      >
        {t(errorKey(periods.error ?? ranking.error))}
      </p>
    )
  }

  // Mentre no hi hagi resposta no hi ha bloc. Un esquelet de dos números entre
  // la capçalera i la ratxa parpellejaria a cada obertura per una xifra que no
  // és el que la gent ve a buscar aquí.
  if (ranking.data === undefined) return null

  const row = ranking.data.find((r) => r.user_id === userId) ?? null

  if (row === null) {
    return (
      <p className="px-[var(--ds-gutter)] pt-8 text-sm-lo text-fg-muted-lo [text-wrap:pretty]">
        {t('member.standing.hidden')}
      </p>
    )
  }

  return (
    <section className="mt-8 grid grid-cols-2 border-y border-surface-7">
      {/* Les dues etiquetes són les del teu propi perfil, i literalment les
          mateixes claus: «punts» i «de 94» no diuen res de qui les mira, i dues
          còpies del mateix mot en tres idiomes és com es divergeix. */}
      <Stat value={String(row.punts)} label={t('profile.stats.points')} />
      <Stat
        value={formatOrdinal(row.posicio, locale)}
        label={t('profile.stats.position', { total: ranking.data.length })}
        divided
      />
    </section>
  )
}

function Stat({
  value,
  label,
  divided = false,
}: {
  readonly value: string
  readonly label: string
  readonly divided?: boolean
}) {
  return (
    <div className={`px-10 py-8 ${divided ? 'border-l border-surface-7' : ''}`}>
      <p className="tabular display text-d-md tracking-[-0.045em]">{value}</p>
      <p className="mt-[3px] text-2xs font-bold tracking-[0.06em] text-fg-dim uppercase">{label}</p>
    </div>
  )
}
