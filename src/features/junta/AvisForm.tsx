import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { profileScreenKeys } from '@/features/profile/api'
import { formatDayMonth } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'

import { MAX_RESTA, avisValid, llegeixAvis } from './avis'
import { clauGravetat, nomDelTipus } from './avisTipus'
import { avisa, avisosKeys, fetchAvisTipus } from './avisosApi'
import { Field, INPUT } from './formBits'
import { fetchAjustEvents, memberPointsKeys } from './memberPointsApi'

/**
 * Registrar un avís, i dir abans què passarà.
 *
 * LA CONFIRMACIÓ DIU LES CONSEQÜÈNCIES PEL SEU NOM, i és la meitat que
 * justifica que aquest formulari no sigui un botó. Un avís fa tres coses alhora
 * —deixa una fila que no s'esborra mai, pot restar punts del rànquing, i la
 * persona ho llegirà amb el motiu escrit— i cap de les tres es veu apretant. La
 * frase de confirmació les diu totes tres amb el nom de qui les rebrà i amb el
 * número exacte de punts, perquè el moment de saber-ho és abans.
 *
 * DUES PASSES I NO UN `confirm()`. El diàleg del navegador no es pot traduir, no
 * es pot escriure en dues línies i a l'iPhone en mode standalone surt amb el
 * domini a dalt. El panell de sota és el mateix gest que ja fa «Dóna de baixa» a
 * la llista de socis.
 *
 * ELS PUNTS ES PRECARREGUEN DEL CATÀLEG I ES PODEN CANVIAR. `punts_suggerits`
 * només precarrega: un cop l'avís existeix, els seus punts són els seus, i
 * re-afinar el barem al juny no reescriu què va valer una nit d'octubre. Canviar
 * de tipus torna a precarregar mentre ningú no hagi tocat el camp; un cop tocat,
 * mana el que hi ha escrit, perquè sobreescriure el que algú acaba d'escriure és
 * pitjor que tenir un número vell.
 *
 * `type="text"` I NO `type="number"`, com a `AdjustPointsBlock`: al teclat
 * numèric de l'iPhone no hi ha el signe menys i aquest camp és negatiu gairebé
 * sempre. El parseig viu a `avis.ts` —i el fitxer es diu així i no `avisForm`
 * perquè en un sistema de fitxers que no distingeix majúscules, `avisForm.ts` i
 * `AvisForm.tsx` són el mateix nom i TypeScript refusa el programa sencer.
 *
 * NOMÉS ELS TIPUS ACTIUS. Un tipus retirat continua posant nom als avisos vells
 * —per això la llista els llegeix tots— però no ha de sortir aquí: retirar-lo
 * del formulari sense trencar el que ja hi ha és exactament el que vol dir
 * `actiu = false`.
 *
 * NO NECESSITA `networkMode: 'always'`: aquesta mutació no escriu a cap cua.
 * Sense xarxa, React Query la deixa en pausa i el que la junta ha escrit es
 * queda al formulari, que és el que ha de passar quan no hi ha cap lloc on
 * desar-ho.
 */

const BAD = 'border-[var(--ds-warning)]'

export function AvisForm({ userId, nombre }: { readonly userId: string; readonly nombre: string }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const client = useQueryClient()

  const [tipus, setTipus] = useState('')
  const [punts, setPunts] = useState('')
  const [tocat, setTocat] = useState(false)
  const [nota, setNota] = useState('')
  const [eventId, setEventId] = useState('')
  const [confirmant, setConfirmant] = useState(false)
  const [fet, setFet] = useState<string | null>(null)

  const cataleg = useQuery({ queryKey: avisosKeys.tipus(), queryFn: fetchAvisTipus })
  const events = useQuery({
    queryKey: memberPointsKeys.events(),
    queryFn: () => fetchAjustEvents(),
  })

  const traduccio = (clau: string): string =>
    i18n.exists(`avisos.tipus.${clau}`) ? t(`avisos.tipus.${clau}`) : ''

  // Una gravetat fora de l'1-3 no hauria d'existir —la CHECK la fita— però si
  // hi arriba, el número pelat diu la veritat i una cadena buida no.
  const gravetatNom = (n: number): string => {
    const clau = clauGravetat(n)
    return clau === null ? String(n) : t(clau)
  }

  const actius = (cataleg.data ?? []).filter((row) => row.actiu)
  const triat = actius.find((row) => row.clau === tipus)

  const lectura = llegeixAvis({ tipus, punts, nota })
  const valid = avisValid(lectura)

  const registra = useMutation({
    mutationFn: () => {
      if (!valid) throw new Error('formulari incomplet')
      return avisa({
        userId,
        tipus: lectura.tipus,
        nota: lectura.nota,
        punts: lectura.punts,
        eventId: eventId === '' ? null : eventId,
      })
    },
    onSuccess: async () => {
      // Fotografiat abans de buidar: el missatge ha de sobreviure als camps que
      // l'han produït, com a `AdjustPointsBlock`.
      setFet(triat === undefined ? null : nomDelTipus(triat, traduccio(triat.clau)))
      setTipus('')
      setPunts('')
      setTocat(false)
      setNota('')
      setEventId('')
      setConfirmant(false)
      await client.invalidateQueries({ queryKey: avisosKeys.ofMember(userId) })
      await client.invalidateQueries({ queryKey: avisosKeys.comptes() })
      await client.invalidateQueries({ queryKey: profileScreenKeys.points(userId) })
      await client.invalidateQueries({ queryKey: ['ranking'] })
    },
  })

  const canviaTipus = (clau: string) => {
    setTipus(clau)
    setFet(null)
    setConfirmant(false)
    // Mentre ningú no hagi tocat el camp, el catàleg mana. Un cop tocat, no:
    // esborrar el que algú acaba d'escriure en triar un altre tipus és pitjor
    // que deixar-li un número que ell mateix ha posat.
    if (!tocat) {
      const row = actius.find((r) => r.clau === clau)
      setPunts(row === undefined ? '' : String(row.punts_suggerits))
    }
  }

  return (
    <div className="mt-10 border border-surface-8 bg-surface-2 p-9">
      <h3 className="eyebrow text-fg-muted">{t('junta.soci.avis.title')}</h3>
      <p className="mt-4 pb-9 text-sm text-fg-secondary [text-wrap:pretty]">
        {t('junta.soci.avis.lede')}
      </p>

      <Field label={t('junta.soci.avis.tipus')} hint={t('junta.soci.avis.tipusHint')}>
        <select
          value={tipus}
          onChange={(e) => {
            canviaTipus(e.target.value)
          }}
          aria-label={t('junta.soci.avis.tipus')}
          className={INPUT}
        >
          <option value="">{t('junta.soci.avis.tipusNone')}</option>
          {actius.map((row) => (
            <option key={row.clau} value={row.clau}>
              {nomDelTipus(row, traduccio(row.clau))}
            </option>
          ))}
        </select>
      </Field>

      {triat === undefined ? null : (
        <p className="-mt-6 pb-9 text-sm-lo text-[var(--ds-text-muted-lo)] [text-wrap:pretty]">
          {t('junta.soci.avis.gravetatIs', { gravetat: gravetatNom(triat.gravetat) })}
        </p>
      )}

      <Field label={t('junta.soci.avis.punts')} hint={t('junta.soci.avis.puntsHint')}>
        <input
          value={punts}
          onChange={(e) => {
            setPunts(e.target.value)
            setTocat(true)
            setFet(null)
            setConfirmant(false)
          }}
          inputMode="numeric"
          type="text"
          autoComplete="off"
          placeholder="0"
          aria-label={t('junta.soci.avis.punts')}
          aria-invalid={lectura === 'punts'}
          maxLength={5}
          className={`${INPUT} tabular ${lectura === 'punts' ? BAD : ''}`}
        />
      </Field>

      {lectura === 'punts' ? (
        <p role="alert" className="-mt-6 pb-9 text-sm font-bold text-[var(--ds-warning)]">
          {t('junta.soci.avis.puntsBad', { max: MAX_RESTA })}
        </p>
      ) : null}

      <Field label={t('junta.soci.avis.note')} hint={t('junta.soci.avis.noteHint', { nombre })}>
        <textarea
          value={nota}
          onChange={(e) => {
            setNota(e.target.value)
            setFet(null)
            setConfirmant(false)
          }}
          rows={3}
          placeholder={t('junta.soci.avis.notePlaceholder')}
          aria-label={t('junta.soci.avis.note')}
          aria-invalid={lectura === 'nota'}
          maxLength={500}
          className={`${INPUT} resize-y ${lectura === 'nota' ? BAD : ''}`}
        />
      </Field>

      {lectura === 'nota' ? (
        <p role="alert" className="-mt-6 pb-9 text-sm font-bold text-[var(--ds-warning)]">
          {t('junta.soci.avis.noteBad')}
        </p>
      ) : null}

      <Field label={t('junta.soci.avis.event')} hint={t('junta.soci.avis.eventHint')}>
        <select
          value={eventId}
          onChange={(e) => {
            setEventId(e.target.value)
            setConfirmant(false)
          }}
          aria-label={t('junta.soci.avis.event')}
          className={INPUT}
        >
          <option value="">{t('junta.soci.avis.eventNone')}</option>
          {(events.data ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.titulo ?? formatDayMonth(new Date(e.starts_at), locale)}
            </option>
          ))}
        </select>
      </Field>

      {confirmant && valid ? (
        <div className="border border-[var(--ds-warning)] p-7">
          {/* Les tres conseqüències, amb nom i número. La dels punts canvia de
              frase quan són zero: «es restaran 0 punts» és una manera de dir
              «cap» que fa dubtar justament quan no cal. */}
          <p className="text-md font-bold [text-wrap:pretty]">{t('junta.soci.avis.sureTitle')}</p>
          <p className="mt-4 text-sm text-fg-secondary [text-wrap:pretty]">
            {lectura.punts === 0
              ? t('junta.soci.avis.sureNoPoints', { nombre })
              : // EN VALOR ABSOLUT. La frase ja porta el «es restaran», i amb el
                // signe deia «es restaran -25 punts», que és un doble negatiu i
                // es llegeix com si en sumés vint-i-cinc. Es va veure obrint la
                // pantalla, no llegint-la.
                t('junta.soci.avis.surePoints', {
                  nombre,
                  punts: String(Math.abs(lectura.punts)),
                })}
          </p>
          <p className="mt-3 text-sm text-fg-secondary [text-wrap:pretty]">
            {t('junta.soci.avis.sureSeen', { nombre })}
          </p>
          <div className="mt-6 flex gap-4">
            <button
              type="button"
              disabled={registra.isPending}
              onClick={() => {
                registra.mutate()
              }}
              className="min-h-[50px] flex-1 border-[1.5px] border-[var(--ds-warning)] px-5 text-md font-bold text-[var(--ds-warning)] [text-wrap:balance] disabled:opacity-60"
            >
              {t('junta.soci.avis.sureCta')}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmant(false)
              }}
              className="min-h-[50px] flex-none px-5 text-md font-bold text-fg-muted"
            >
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={!valid}
          onClick={() => {
            setConfirmant(true)
          }}
          className="min-h-[52px] w-full bg-brand-cta px-6 text-md font-bold text-on-brand [text-wrap:balance] disabled:opacity-45"
        >
          {t('junta.soci.avis.save')}
        </button>
      )}

      {fet === null ? null : (
        <p role="status" className="pt-6 text-md font-bold text-success [text-wrap:pretty]">
          {t('junta.soci.avis.done', { tipus: fet, nombre })}
        </p>
      )}

      {registra.isError ? (
        <p role="alert" className="pt-6 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(registra.error))}
        </p>
      ) : null}
    </div>
  )
}
