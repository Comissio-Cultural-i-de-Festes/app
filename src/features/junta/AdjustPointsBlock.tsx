import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { profileScreenKeys } from '@/features/profile/api'
import { formatDayMonth } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { errorKey } from '@/lib/errors'
import { Button } from '@/ui/Button/Button'
import { DoneLine } from '@/ui/Notice/DoneLine'

import { MAX_AJUST, esValid, llegeixAjust } from './adjust'
import { Field, INPUT } from './formBits'
import { adjustPoints, fetchAjustEvents, memberPointsKeys } from './memberPointsApi'

/**
 * Els punts que falten o els que sobren, amb el per què al costat.
 *
 * LA NOTA ÉS OBLIGATÒRIA I HO DIU ABANS, no després d'apretar. La garantia viu
 * a la migració 72 —un `manual` sense nota torna 22023— i aquí es repeteix
 * perquè un 22023 es tradueix a «errors.generic», que és «alguna cosa ha anat
 * malament» i no «t'has deixat el per què».
 *
 * L'ETIQUETA DIU QUI HO LLEGIRÀ, i és la decisió que ha costat més: la nota
 * surt al perfil del soci. Una correcció que la persona no pot llegir és
 * pitjor que una que sí —es troba vint punts menys i no sap de què—, però és
 * un text que la junta escriu sobre algú i es llegirà com un judici. Si es
 * publica, s'ha de saber abans d'escriure-hi, no després.
 *
 * L'ESDEVENIMENT ÉS OPCIONAL i arrenca buit. `points_log.event_id` és
 * nullable, i un ajust sense esdeveniment és més honest quan la raó no és una
 * festa concreta. Quan sí que ho és, penjar-l'hi fa que la fila surti amb el
 * nom de la nit al llibre major en comptes d'un «a mà» solitari.
 *
 * EL SIGNE VA DINS DEL CAMP. Un parell de botons +/− al costat seria un estat
 * més i una pregunta més; «-20» és -20, com s'escriu en un paper.
 *
 * NO NECESSITA `networkMode: 'always'`: aquesta mutació no escriu a cap cua.
 * Sense xarxa, React Query la deixa en pausa i el que la persona ha escrit es
 * queda al formulari, que és exactament el que ha de passar quan no hi ha cap
 * lloc on desar-ho.
 *
 * LA VALIDACIÓ NO CRIDA, LA DESCRIU. Les dues frases d'error anaven amb
 * `role="alert"`, i el que les fa aparèixer és cada tecla: escrivint «900» el
 * lector de pantalla interrompia l'usuari al mig de la paraula per dir-li que
 * el número no val, i se'n tornava a anar en escriure el caràcter següent. Ara
 * pengen del camp per `aria-describedby`, que és el que `aria-invalid` estava
 * anunciant sense tenir —«no vàlid» i cap manera de saber per què—. Es
 * llegeixen en arribar al camp i en sortir-ne, que és quan serveixen.
 *
 * L'ERROR DE DESAR SÍ QUE ÉS UN `alert`: aquell no el produeix teclejar, el
 * produeix apretar, i és la resposta a una acció que la persona ja ha acabat.
 */

const BOX = 'mt-10 border border-surface-8 bg-surface-2 p-9'
const BAD = 'border-[var(--ds-warning)]'

export function AdjustPointsBlock({
  userId,
  nombre,
}: {
  readonly userId: string
  readonly nombre: string
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const client = useQueryClient()

  const [punts, setPunts] = useState('')
  const [nota, setNota] = useState('')
  const [eventId, setEventId] = useState('')
  const [fet, setFet] = useState<number | null>(null)
  const errPunts = useId()
  const errNota = useId()
  // En desar, els camps es buiden i el botó que tenia el focus es desactiva.
  // Un element desactivat no pot tenir el focus, així que queia al `<body>`:
  // el tabulador següent tornava a començar pel capdamunt del document i qui
  // navega per teclat perdia el lloc just després de fer la feina. Torna al
  // primer camp, que és on s'escriu el següent ajust si n'hi ha.
  const primerCamp = useRef<HTMLInputElement>(null)

  const events = useQuery({
    queryKey: memberPointsKeys.events(),
    queryFn: () => fetchAjustEvents(),
  })

  const lectura = llegeixAjust({ punts, nota })
  const valid = esValid(lectura)

  const desa = useMutation({
    mutationFn: () => {
      if (!valid) throw new Error('formulari incomplet')
      return adjustPoints({
        userId,
        punts: lectura.punts,
        nota: lectura.nota,
        eventId: eventId === '' ? null : eventId,
      })
    },
    onSuccess: async () => {
      // Fotografiat abans de buidar el formulari: el missatge ha de sobreviure
      // als camps que l'han produït. Mateix gest que la pantalla de socis.
      setFet(valid ? lectura.punts : null)
      setPunts('')
      setNota('')
      setEventId('')
      primerCamp.current?.focus()
      await client.invalidateQueries({ queryKey: profileScreenKeys.points(userId) })
      await client.invalidateQueries({ queryKey: ['ranking'] })
    },
  })

  return (
    <section className={BOX}>
      <h2 className="eyebrow text-fg-muted">{t('junta.soci.adjust.title')}</h2>
      <p className="mt-4 pb-9 text-sm text-fg-secondary [text-wrap:pretty]">
        {t('junta.soci.adjust.lede')}
      </p>

      <Field label={t('junta.soci.adjust.points')} hint={t('junta.soci.adjust.pointsHint')}>
        <input
          ref={primerCamp}
          value={punts}
          onChange={(e) => {
            setPunts(e.target.value)
            setFet(null)
          }}
          // `text` i no `number`: a l'iPhone el teclat numèric d'un `number` no
          // porta el signe menys, i tota la meitat de restar quedaria darrere
          // d'un canvi de teclat. `inputMode` demana el teclat bo sense
          // demanar la validació del navegador, que aquí ja la fa `adjust.ts`.
          inputMode="numeric"
          type="text"
          autoComplete="off"
          placeholder={t('junta.soci.adjust.pointsPlaceholder')}
          aria-label={t('junta.soci.adjust.points')}
          aria-invalid={lectura === 'punts'}
          aria-describedby={lectura === 'punts' ? errPunts : undefined}
          maxLength={5}
          className={`${INPUT} tabular ${lectura === 'punts' ? BAD : ''}`}
        />
      </Field>

      {lectura === 'punts' ? (
        <p id={errPunts} className="-mt-6 pb-9 text-sm font-bold text-[var(--ds-warning)]">
          {t('junta.soci.adjust.pointsBad', { max: MAX_AJUST })}
        </p>
      ) : null}

      <Field label={t('junta.soci.adjust.note')} hint={t('junta.soci.adjust.noteHint', { nombre })}>
        <textarea
          value={nota}
          onChange={(e) => {
            setNota(e.target.value)
            setFet(null)
          }}
          rows={3}
          placeholder={t('junta.soci.adjust.notePlaceholder')}
          aria-label={t('junta.soci.adjust.note')}
          aria-invalid={lectura === 'nota'}
          aria-describedby={lectura === 'nota' ? errNota : undefined}
          maxLength={500}
          className={`${INPUT} resize-y ${lectura === 'nota' ? BAD : ''}`}
        />
      </Field>

      {lectura === 'nota' ? (
        <p id={errNota} className="-mt-6 pb-9 text-sm font-bold text-[var(--ds-warning)]">
          {t('junta.soci.adjust.noteBad')}
        </p>
      ) : null}

      <Field label={t('junta.soci.adjust.event')} hint={t('junta.soci.adjust.eventHint')}>
        <select
          value={eventId}
          onChange={(e) => {
            setEventId(e.target.value)
          }}
          aria-label={t('junta.soci.adjust.event')}
          className={INPUT}
        >
          <option value="">{t('junta.soci.adjust.eventNone')}</option>
          {(events.data ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {/* Sense títol quan encara no s'ha revelat: la data el
                  identifica igual i amagar-lo seria amagar-li a la junta un
                  esdeveniment que ella mateixa ha creat. */}
              {e.titulo ?? formatDayMonth(new Date(e.starts_at), locale)}
            </option>
          ))}
        </select>
      </Field>

      <Button
        disabled={!valid || desa.isPending}
        onClick={() => {
          desa.mutate()
        }}
      >
        {t('junta.soci.adjust.save')}
      </Button>

      <DoneLine
        className="pt-6"
        message={
          fet === null
            ? null
            : t('junta.soci.adjust.done', {
                punts: fet > 0 ? `+${String(fet)}` : String(fet),
                nombre,
              })
        }
      />

      {desa.isError ? (
        <p role="alert" className="pt-6 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(desa.error))}
        </p>
      ) : null}
    </section>
  )
}
