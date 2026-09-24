import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { APP_TIME_ZONE } from '@/i18n/format'
import { errorKey } from '@/lib/errors'
import { Button } from '@/ui/Button/Button'
import { Confirm } from '@/ui/Confirm/Confirm'
import { DoneLine } from '@/ui/Notice/DoneLine'

import { MAX_MESURA, MAX_RESTA } from './avis'
import { nomDelTipus } from './avisTipus'
import { avisosKeys, fetchAvisTipus } from './avisosApi'
import { fromDateInput, toDateInput } from './configApi'
import { Field, INPUT } from './formBits'
import { GravetatTria } from './GravetatTria'
import { JuntaHeader } from './JuntaHeader'
import { MAX_NOM, type ProblemaPendent, llegeixPendent, pendentValid } from './pendents'
import { creaPendent, pendentsKeys } from './pendentsApi'

/**
 * Un avís per a algú que encara no té compte.
 *
 * ELS MATEIXOS CAMPS QUE UN AVÍS, I TRES MÉS: el nom, per reconèixer la
 * persona; el telèfon, que és per on la trobarà l'enganxada de la migració 88; i
 * el dia de la falta, perquè l'avís compti al curs i al trimestre en què va
 * passar i no al dia que la persona es faci el compte.
 *
 * ELS PUNTS I LA GRAVETAT ES PRECARREGUEN DEL TIPUS, amb la regla d'`AvisForm`:
 * mentre ningú no els hagi tocat, canviar de tipus els torna a posar; un cop
 * tocats, mana el que hi ha escrit. I el camp dels punts neix BUIT i no a zero:
 * un zero que ningú no ha triat seria un avís que no resta sense que ningú ho
 * hagi decidit.
 *
 * LA CONFIRMACIÓ DIU QUÈ PASSARÀ: que la persona encara no té compte, que l'avís
 * s'hi enganxarà sol quan algú es faci soci amb aquell telèfon, i que si ja n'hi
 * ha un, serà ara mateix. És la conseqüència que no es veu.
 *
 * LA DATA ES CONVERTEIX AMB LA ZONA DE L'ASSOCIACIÓ (`APP_TIME_ZONE`, de
 * `src/config`) i no amb la del telèfon: «el 14 d'octubre» és el 14 d'octubre
 * d'aquí, i la base no té cap zona escrita.
 *
 * NO NECESSITA `networkMode: 'always'`: no escriu a cap cua, i sense xarxa es
 * queda en pausa i ho diu, com `AvisForm`.
 */

const BAD = 'border-warning'
const GUTTER = 'px-[var(--ds-gutter)]'

export function AvisPendentFormScreen() {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()

  const [nom, setNom] = useState('')
  const [telefon, setTelefon] = useState('')
  const [dia, setDia] = useState('')
  const [tipus, setTipus] = useState('')
  const [gravetat, setGravetat] = useState<number | null>(null)
  const [gravetatTocada, setGravetatTocada] = useState(false)
  const [punts, setPunts] = useState('')
  const [puntsTocats, setPuntsTocats] = useState(false)
  const [nota, setNota] = useState('')
  const [mesura, setMesura] = useState('')
  const [confirmant, setConfirmant] = useState(false)
  const [fet, setFet] = useState<string | null>(null)
  const errId = useId()

  const cataleg = useQuery({ queryKey: avisosKeys.tipus(), queryFn: fetchAvisTipus })
  const actius = (cataleg.data ?? []).filter((row) => row.actiu)
  const triat = actius.find((row) => row.clau === tipus)

  const traduccio = (clau: string): string =>
    i18n.exists(`avisos.tipus.${clau}`) ? t(`avisos.tipus.${clau}`) : ''

  const avui = toDateInput(new Date().toISOString(), APP_TIME_ZONE)
  const lectura = llegeixPendent({ nom, telefon, dia, tipus, punts, nota, mesura }, avui)
  const valid = pendentValid(lectura) && gravetat !== null

  const toca = () => {
    setFet(null)
    setConfirmant(false)
  }

  const registra = useMutation({
    mutationFn: () => {
      if (!pendentValid(lectura)) throw new Error('formulari incomplet')
      const faltaAt = fromDateInput(lectura.dia, APP_TIME_ZONE)
      if (faltaAt === null) throw new Error('data il·legible')
      return creaPendent({
        nom: lectura.nom,
        telefon: lectura.telefon,
        faltaAt,
        tipus: lectura.tipus,
        gravetat,
        nota: lectura.nota,
        punts: lectura.punts,
        mesuraPresa: lectura.mesura,
      })
    },
    onSuccess: async () => {
      setFet(nom.trim())
      setNom('')
      setTelefon('')
      setDia('')
      setTipus('')
      setGravetat(null)
      setGravetatTocada(false)
      setPunts('')
      setPuntsTocats(false)
      setNota('')
      setMesura('')
      setConfirmant(false)
      // Si s'ha enganxat a l'acte, hi ha un avís nou d'algú i el llibre major
      // ha canviat: s'invalida tot el que en depèn, no només la llista.
      await client.invalidateQueries({ queryKey: pendentsKeys.all() })
      await client.invalidateQueries({ queryKey: ['junta', 'avisos'] })
      await client.invalidateQueries({ queryKey: ['ranking'] })
    },
  })

  const canviaTipus = (clau: string) => {
    setTipus(clau)
    toca()
    const row = actius.find((r) => r.clau === clau)
    if (!puntsTocats) setPunts(row === undefined ? '' : String(row.punts_suggerits))
    if (!gravetatTocada) setGravetat(row?.gravetat ?? null)
  }

  const problema = typeof lectura === 'string' ? lectura : null
  const missatge: Record<ProblemaPendent, string> = {
    nom: t('junta.pendents.form.nomBad', { max: MAX_NOM }),
    telefon: t('junta.pendents.form.telefonBad'),
    dia: t('junta.pendents.form.diaBad'),
    tipus: t('junta.soci.avis.tipusNone'),
    punts: t('junta.soci.avis.puntsBad', { max: MAX_RESTA }),
    nota: t('junta.soci.avis.noteBad'),
    mesura: t('junta.soci.avis.mesuraBad', { max: MAX_MESURA }),
  }

  return (
    <main className="min-h-dvh bg-app pb-[calc(var(--ds-safe-bottom)+32px)]">
      <JuntaHeader to="/junta" label={t('junta.back')} title={t('junta.pendents.form.title')} />

      <div className={`pt-8 ${GUTTER}`}>
        <p className="pb-9 text-md text-fg-secondary [text-wrap:pretty]">
          {t('junta.pendents.form.lede')}
        </p>

        <Field label={t('junta.pendents.form.nom')} hint={t('junta.pendents.form.nomHint')}>
          <input
            value={nom}
            onChange={(e) => {
              setNom(e.target.value)
              toca()
            }}
            type="text"
            autoComplete="off"
            maxLength={MAX_NOM + 10}
            aria-label={t('junta.pendents.form.nom')}
            aria-invalid={problema === 'nom'}
            aria-describedby={problema === 'nom' ? errId : undefined}
            className={`${INPUT} ${problema === 'nom' ? BAD : ''}`}
          />
        </Field>

        <Field label={t('junta.pendents.form.telefon')} hint={t('junta.pendents.form.telefonHint')}>
          <input
            value={telefon}
            onChange={(e) => {
              setTelefon(e.target.value)
              toca()
            }}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            aria-label={t('junta.pendents.form.telefon')}
            aria-invalid={problema === 'telefon'}
            aria-describedby={problema === 'telefon' ? errId : undefined}
            className={`${INPUT} tabular ${problema === 'telefon' ? BAD : ''}`}
          />
        </Field>

        <Field label={t('junta.pendents.form.dia')} hint={t('junta.pendents.form.diaHint')}>
          <input
            value={dia}
            onChange={(e) => {
              setDia(e.target.value)
              toca()
            }}
            type="date"
            max={avui}
            aria-label={t('junta.pendents.form.dia')}
            aria-invalid={problema === 'dia'}
            aria-describedby={problema === 'dia' ? errId : undefined}
            className={`${INPUT} ${problema === 'dia' ? BAD : ''}`}
          />
        </Field>

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
          <GravetatTria
            suggerida={triat.gravetat}
            triada={gravetat}
            onTria={(n) => {
              setGravetat(n)
              setGravetatTocada(true)
              toca()
            }}
          />
        )}

        <Field label={t('junta.soci.avis.punts')} hint={t('junta.soci.avis.puntsHint')}>
          <input
            value={punts}
            onChange={(e) => {
              setPunts(e.target.value)
              setPuntsTocats(true)
              toca()
            }}
            inputMode="numeric"
            type="text"
            autoComplete="off"
            aria-label={t('junta.soci.avis.punts')}
            aria-invalid={problema === 'punts'}
            aria-describedby={problema === 'punts' ? errId : undefined}
            maxLength={5}
            className={`${INPUT} tabular ${problema === 'punts' ? BAD : ''}`}
          />
        </Field>

        <Field label={t('junta.soci.avis.note')} hint={t('junta.pendents.form.noteHint')}>
          <textarea
            value={nota}
            onChange={(e) => {
              setNota(e.target.value)
              toca()
            }}
            rows={3}
            placeholder={t('junta.soci.avis.notePlaceholder')}
            aria-label={t('junta.soci.avis.note')}
            aria-invalid={problema === 'nota'}
            aria-describedby={problema === 'nota' ? errId : undefined}
            maxLength={500}
            className={`${INPUT} resize-y ${problema === 'nota' ? BAD : ''}`}
          />
        </Field>

        <Field label={t('junta.soci.avis.mesura')} hint={t('junta.pendents.form.mesuraHint')}>
          <textarea
            value={mesura}
            onChange={(e) => {
              setMesura(e.target.value)
              toca()
            }}
            rows={2}
            placeholder={t('junta.soci.avis.mesuraPlaceholder')}
            aria-label={t('junta.soci.avis.mesura')}
            aria-invalid={problema === 'mesura'}
            aria-describedby={problema === 'mesura' ? errId : undefined}
            maxLength={MAX_MESURA + 20}
            className={`${INPUT} resize-y ${problema === 'mesura' ? BAD : ''}`}
          />
        </Field>

        {/* Una sola línia per al camp que falla, pel mateix motiu que a
            `AvisForm`: descriu, no crida, i penja del camp per
            `aria-describedby`. */}
        {problema === null ? null : (
          <p id={errId} aria-live="polite" className="pb-9 text-sm font-bold text-warning">
            {missatge[problema]}
          </p>
        )}

        {confirmant && valid && pendentValid(lectura) ? (
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
            <p className="text-md font-bold [text-wrap:pretty]">{t('junta.soci.avis.sureTitle')}</p>
            <p className="mt-4 text-sm text-fg-secondary [text-wrap:pretty]">
              {t('junta.pendents.form.sure', { nom: lectura.nom })}
            </p>
            <p className="mt-3 text-sm text-fg-secondary [text-wrap:pretty]">
              {lectura.punts === 0
                ? t('junta.pendents.form.sureNoPoints')
                : t('junta.pendents.form.surePoints', { punts: String(Math.abs(lectura.punts)) })}
            </p>
          </Confirm>
        ) : (
          <Button
            disabled={!valid}
            onClick={() => {
              setConfirmant(true)
            }}
          >
            {t('junta.pendents.form.save')}
          </Button>
        )}

        {registra.isPaused ? (
          <p role="status" className="pt-6 text-sm font-bold text-warning [text-wrap:pretty]">
            {t('junta.soci.avis.paused')}
          </p>
        ) : null}

        <DoneLine
          className="pt-6"
          message={fet === null ? null : t('junta.pendents.form.done', { nom: fet })}
        />

        {registra.isError ? (
          <p role="alert" className="pt-6 text-md font-bold text-error [text-wrap:pretty]">
            {t(errorKey(registra.error))}
          </p>
        ) : null}
      </div>
    </main>
  )
}
