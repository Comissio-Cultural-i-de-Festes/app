import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { profileScreenKeys } from '@/features/profile/api'
import { formatDayMonth } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Button } from '@/ui/Button/Button'
import { Confirm } from '@/ui/Confirm/Confirm'
import { DoneLine } from '@/ui/Notice/DoneLine'

import { MAX_RESTA, avisValid, llegeixAvis } from './avis'
import { clauGravetat, clauQueFer, nomDelTipus } from './avisTipus'
import { avisa, avisosKeys, fetchAvisTipus } from './avisosApi'
import { clauEstat, clauQueFerEstat, escaloNou } from './estatAvisos'
import { Field, INPUT } from './formBits'
import { fetchAjustEvents, memberPointsKeys } from './memberPointsApi'
import { useNormativa } from './useNormativa'

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
 * LA GRAVETAT ES PRECARREGA DEL TIPUS I ES POT CANVIAR, amb la mateixa regla
 * que els punts: mentre ningú no l'hagi tocada, canviar de tipus la torna a
 * precarregar; un cop tocada, mana la triada. Des de la migració 84 la gravetat
 * no és una etiqueta —decideix quant pesa l'avís i, per tant, si algú arriba a
 * risc— i la 85 deixa que sigui la junta qui la decideixi. Tres botons i no un
 * desplegable: són tres opcions que s'han de veure alhora, cadascuna amb el que
 * vol dir, i la suggerida marcada perquè canviar-la sigui un acte i no un
 * descuit.
 *
 * I LA CONFIRMACIÓ DIU L'ESCALÓ NOU, si n'hi ha: «amb aquest avís passa a
 * risc» és la conseqüència més gran que té el botó, i és la que no es veu. La
 * calcula `escaloNou()`, amb la mateixa regla que després pintarà el xip.
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
 *
 * PERÒ SÍ QUE HO HA DE DIR. Una pausa sense veu és un botó que no contesta: qui
 * premia «Sí, registra'l» sota terra veia el botó quedar-se ocupat i res més,
 * cap error, cap frase, i minuts després la fila apareixia sola quan tornava la
 * cobertura. No es perdia res —és el disseny— però l'única cosa que la junta
 * veia era una pantalla espatllada, i el remei que se li acut a qualsevol és
 * tornar-hi, que és com es registra dos cops el mateix. `isPaused` ho diu amb
 * una línia. La cua no hi entra: aquesta mutació no n'escriu cap i posar-n'hi
 * una voldria dir un cinquè magatzem a `queue.ts`, un `client_request_id` i una
 * RPC idempotent, que és molta màquina per a una pantalla que la junta fa
 * servir asseguda.
 *
 * LA VALIDACIÓ NO CRIDA, LA DESCRIU, i és la mateixa forma que `AdjustPointsBlock`
 * va trobar al costat: les dues frases anaven amb `role="alert"` i el que les fa
 * aparèixer és cada tecla, o sigui que escrivint «-900» el lector de pantalla
 * interrompia l'usuari al mig de la paraula i se'n tornava a anar al caràcter
 * següent. Ara pengen del camp per `aria-describedby`, que és el que
 * `aria-invalid` estava anunciant sense tenir. L'error de desar sí que continua
 * sent un `alert`: aquell no el produeix teclejar, el produeix apretar.
 */

const BAD = 'border-warning'

export function AvisForm({
  userId,
  nombre,
  pesAra,
}: {
  readonly userId: string
  readonly nombre: string
  /** El pes que porta aquest curs, per dir si l'avís el canvia d'escaló. */
  readonly pesAra: number
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const client = useQueryClient()

  const [tipus, setTipus] = useState('')
  const [punts, setPunts] = useState('')
  const [tocat, setTocat] = useState(false)
  const [gravetat, setGravetat] = useState<number | null>(null)
  const [gravetatTocada, setGravetatTocada] = useState(false)
  const [nota, setNota] = useState('')
  const [eventId, setEventId] = useState('')
  const [confirmant, setConfirmant] = useState(false)
  const [fet, setFet] = useState<string | null>(null)
  const errPunts = useId()
  const errNota = useId()

  const cataleg = useQuery({ queryKey: avisosKeys.tipus(), queryFn: fetchAvisTipus })
  const normativa = useNormativa()
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
  const valid = avisValid(lectura) && gravetat !== null
  const nou = gravetat === null ? null : escaloNou(pesAra, gravetat, normativa)

  const registra = useMutation({
    mutationFn: () => {
      if (!valid || !avisValid(lectura)) throw new Error('formulari incomplet')
      return avisa({
        userId,
        tipus: lectura.tipus,
        gravetat,
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
      setGravetat(null)
      setGravetatTocada(false)
      setNota('')
      setEventId('')
      setConfirmant(false)
      await client.invalidateQueries({ queryKey: avisosKeys.ofMember(userId) })
      await client.invalidateQueries({ queryKey: avisosKeys.comptesTots() })
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
    const row = actius.find((r) => r.clau === clau)
    if (!tocat) {
      setPunts(row === undefined ? '' : String(row.punts_suggerits))
    }
    if (!gravetatTocada) setGravetat(row?.gravetat ?? null)
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
        <Field
          label={t('junta.soci.avis.gravetat')}
          hint={t('junta.soci.avis.gravetatHint', { gravetat: gravetatNom(triat.gravetat) })}
        >
          <div className="mt-4 flex gap-4">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={gravetat === n}
                onClick={() => {
                  setGravetat(n)
                  setGravetatTocada(true)
                  setFet(null)
                  setConfirmant(false)
                }}
                className={
                  'flex min-h-[46px] flex-1 items-center justify-center px-3 text-md font-bold [text-wrap:balance] ' +
                  (gravetat === n
                    ? 'bg-brand-cta text-on-brand'
                    : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg-secondary')
                }
              >
                {gravetatNom(n)}
              </button>
            ))}
          </div>
          {gravetat === null || clauQueFer(gravetat) === null ? null : (
            <p className="mt-4 text-sm text-fg-secondary [text-wrap:pretty]">
              {t(clauQueFer(gravetat) ?? '')}
            </p>
          )}
        </Field>
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
          aria-describedby={lectura === 'punts' ? errPunts : undefined}
          maxLength={5}
          className={`${INPUT} tabular ${lectura === 'punts' ? BAD : ''}`}
        />
      </Field>

      {lectura === 'punts' ? (
        <p id={errPunts} aria-live="polite" className="-mt-6 pb-9 text-sm font-bold text-warning">
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
          aria-describedby={lectura === 'nota' ? errNota : undefined}
          maxLength={500}
          className={`${INPUT} resize-y ${lectura === 'nota' ? BAD : ''}`}
        />
      </Field>

      {lectura === 'nota' ? (
        <p id={errNota} aria-live="polite" className="-mt-6 pb-9 text-sm font-bold text-warning">
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

      {confirmant && valid && avisValid(lectura) ? (
        // El mateix panell que la baixa d'un soci i la retirada d'un avís, i no
        // una caixa pròpia: el que canvia d'una confirmació a l'altra és què s'hi
        // diu, i el que ha de ser igual és el parell de botons. La vora ambre es
        // queda perquè aquest és l'únic dels quatre que s'obre dins d'un
        // formulari, i sense ella es confon amb un camp més.
        <Confirm
          className="border border-warning p-7"
          cta={t('junta.soci.avis.sureCta')}
          cancel={t('actions.cancel')}
          busy={registra.isPending}
          onConfirm={() => {
            registra.mutate()
          }}
          onCancel={() => {
            setConfirmant(false)
          }}
        >
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
          {nou === null ? null : (
            <p className="mt-3 text-sm font-bold text-fg [text-wrap:pretty]">
              {t('junta.soci.avis.sureEscalo', {
                nombre,
                estat: t(clauEstat(nou)),
                queFer: t(clauQueFerEstat(nou) ?? clauEstat(nou)),
              })}
            </p>
          )}
          <p className="mt-3 text-sm text-fg-secondary [text-wrap:pretty]">
            {t('junta.soci.avis.sureSeen', { nombre })}
          </p>
        </Confirm>
      ) : (
        <Button
          disabled={!valid}
          onClick={() => {
            setConfirmant(true)
          }}
        >
          {t('junta.soci.avis.save')}
        </Button>
      )}

      {/* En pausa i no fallada: `role="status"` i no `alert`, i en ambre i no
          en vermell. No ha anat res malament —quan torni la cobertura es desa
          sola— i interrompre un lector de pantalla per dir-ho seria dir-ho
          malament. */}
      {registra.isPaused ? (
        <p role="status" className="pt-6 text-sm font-bold text-warning [text-wrap:pretty]">
          {t('junta.soci.avis.paused')}
        </p>
      ) : null}

      <DoneLine
        className="pt-6"
        message={fet === null ? null : t('junta.soci.avis.done', { tipus: fet, nombre })}
      />

      {registra.isError ? (
        <p role="alert" className="pt-6 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(registra.error))}
        </p>
      ) : null}
    </div>
  )
}
