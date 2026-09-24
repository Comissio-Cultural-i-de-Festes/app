import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { clauGravetat, nomDelTipus } from '@/features/junta/avisTipus'
import { avisosKeys, fetchAvisTipus, fetchAvisos } from '@/features/junta/avisosApi'
import { useCurs } from '@/features/ranking/useRanking'
import { formatDayMonth, formatMonthYear } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'

import { volAny } from './avisData'
import { LEDGER_ROW } from './ledger'

/**
 * Els teus avisos, al teu perfil.
 *
 * PER QUÈ UNA TARGETA I NO LA LÍNIA DEL LLIBRE MAJOR. Fins ara un avís només
 * es colava al perfil com una fila més del registre de punts: «Avís −25» amb la
 * nota a sota, barrejat amb els muntatges i les assistències. Tres coses hi
 * faltaven i cap no és decorativa: què va ser —el tipus—, quant pesa —la
 * gravetat— i si s'ha retirat. I un avís de zero punts no hi sortia gens, que és
 * el cas que la migració 73 defensa com el primer avís normal.
 *
 * ES VEU, I ES VEU ENTER. La política d'`avisos` és `user_id = auth.uid() or
 * is_admin()`: qui hi surt el llegeix sencer, amb el motiu escrit. No és una
 * concessió, és la premissa —el formulari de la junta avisa qui l'escriu que
 * això es publicarà— i amagar-ho aquí convertiria aquella frase en mentida.
 *
 * EL RETIRAT ES RATLLA I ES QUEDA, com a la fitxa de la junta. Que consti que hi
 * va haver un avís i que consti que es va retirar: si desaparegués, la persona
 * que va demanar que es revisés no tindria manera de saber que algú ho va fer.
 *
 * ELS D'AQUEST CURS I NO ELS DE SEMPRE. La frase de sota el títol diu «el que la
 * junta ha registrat aquest curs», i la primera versió d'aquesta targeta
 * ensenyava l'històric sencer sota aquella frase. O es canviava la frase, o es
 * fitava la lectura: es fita, perquè el comptador que la junta mira a
 * `/junta/socis` també és del curs i les dues bandes han de dir el mateix
 * número de la mateixa persona.
 *
 * I FITAR LA LECTURA NO BASTA PER A LA DATA, que és el que aquest bloc deia i
 * era fals. La finestra surt de `ranking_periods` i el període `global` no té
 * mai final —`periodsFromChain` hi escriu `ends_at: null`—, o sigui que el que
 * es llegeix és `[inici, ∞)` i no un curs. El setembre que ningú no toqui les
 * dates hi caben dos novembres, i amb «4 de nov.» a la columna els dos es
 * pinten igual. Qui decideix quines files porten l'any és `volAny`, al costat,
 * amb el motiu escrit i la regla d'un any.
 *
 * QUÈ ES PERD I PER QUÈ NO PASSA RES. Un avís d'un curs anterior deixa de
 * sortir al perfil. Continua existint, la fitxa de la junta el continua
 * ensenyant amb l'any a la data, i el `-25` que va restar continua al llibre
 * major de just a sobre. El que desapareix és el recordatori permanent d'una
 * cosa que el comptador ja no compta.
 *
 * SENSE CAP, NO HI HA TARGETA. Un bloc buit que digui «cap avís» al perfil de
 * tothom és recordar-li cada dia a qui no n'ha tingut mai que això existeix.
 * Mateix criteri que la secció d'historial del costat. També és el que es veu
 * mentre els períodes no han arribat: sense ells, `des_de` és null i «sense
 * finestra» seria indistingible de «encara no ho sé», o sigui que la consulta
 * no surt fins que `useCurs().llest`.
 *
 * LES DADES VÉNEN DE `features/junta/avisosApi`, i el nom del fitxer enganya una
 * mica. Aquella lectura no és de la junta: és la mateixa consulta sobre la
 * mateixa taula, i la política decideix qui en veu què. Duplicar-la aquí serien
 * dues consultes amb la seva pròpia edat i el mateix `select`.
 */

export function AvisosCard({ userId }: { readonly userId: string }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)

  const { des_de, fins_a, llest } = useCurs()

  const avisos = useQuery({
    queryKey: avisosKeys.ofMemberPeriode(userId, des_de, fins_a),
    queryFn: () => fetchAvisos(userId, des_de, fins_a),
    enabled: userId !== '' && llest,
  })
  const cataleg = useQuery({
    queryKey: avisosKeys.tipus(),
    queryFn: fetchAvisTipus,
    enabled: userId !== '',
  })

  const rows = avisos.data ?? []
  // Ni mentre carrega ni quan no n'hi ha: la targeta apareix amb contingut o no
  // apareix. Una silueta aquí anunciaria que hi ha alguna cosa a punt d'arribar.
  if (rows.length === 0) return null

  // Un sol rellotge per a totes les files: amb un `new Date()` per fila, dues
  // files del mateix render es podrien comparar contra instants diferents. Que
  // no s'actualitzi sol no importa —el llindar és d'un any— i posar-lo a un
  // estat voldria dir un temporitzador per a una columna de 52px.
  const ara = new Date()

  const traduccio = (clau: string): string =>
    i18n.exists(`avisos.tipus.${clau}`) ? t(`avisos.tipus.${clau}`) : ''

  const nom = (clau: string): string => {
    const row = cataleg.data?.find((r) => r.clau === clau)
    return row === undefined ? clau : nomDelTipus(row, traduccio(clau))
  }

  const gravetatNom = (n: number): string => {
    const clau = clauGravetat(n)
    return clau === null ? String(n) : t(clau)
  }

  return (
    <section className="pt-12 px-[var(--ds-gutter)]">
      <h2 className="eyebrow text-fg-muted">{t('profile.avisos.title')}</h2>
      <p className="mt-3 text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
        {t('profile.avisos.lede')}
      </p>

      <ul className="mt-2">
        {rows.map((row) => {
          const retirat = row.retirat_at !== null
          const punts = row.points_log?.puntos ?? null
          return (
            <li key={row.id} className={LEDGER_ROW}>
              <p className="w-[52px] flex-none pt-[2px] text-sm-lo font-semibold text-fg-dim">
                {/* L'any arriba i el dia se'n va, com a la fitxa de la junta:
                    la columna fa 52px i les tres coses no hi caben. D'un avís
                    vell, el que importa és de quin curs era. */}
                {volAny(row.created_at, ara)
                  ? formatMonthYear(new Date(row.created_at), locale)
                  : formatDayMonth(new Date(row.created_at), locale)}
              </p>
              <div className="min-w-0 flex-1">
                <p
                  className={
                    'text-base font-semibold [text-wrap:pretty] ' +
                    (retirat ? 'text-fg-muted line-through' : '')
                  }
                >
                  {nom(row.tipus)}
                </p>
                <p className="mt-[3px] text-sm-lo text-[var(--ds-text-muted-lo)]">
                  {retirat ? t('profile.avisos.withdrawn') : gravetatNom(row.gravetat)}
                </p>
                <p
                  className={
                    'mt-[5px] text-sm [text-wrap:pretty] ' +
                    (retirat ? 'text-fg-muted line-through' : 'text-fg-secondary')
                  }
                >
                  {row.nota}
                </p>
                {/* Què en va fer la junta, si ho ha escrit (migració 86). Qui
                    hi surt ho llegeix sencer, com la nota: és part del que li
                    ha passat. */}
                {row.mesura_presa === null ? null : (
                  <p className="mt-[5px] text-sm text-fg-secondary [text-wrap:pretty]">
                    <span className="font-bold">{t('profile.avisos.mesura')}</span>{' '}
                    {row.mesura_presa}
                  </p>
                )}
                {row.retirat_nota === null ? null : (
                  <p className="mt-[5px] text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
                    {row.retirat_nota}
                  </p>
                )}
              </div>
              {punts === null || punts === 0 ? null : (
                <p className="tabular flex-none pt-[2px] text-base font-extrabold text-warning">
                  {punts}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
