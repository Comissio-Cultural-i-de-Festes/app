import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import type { Answer } from '@/lib/model'
import type { EventRow } from '@/lib/schema'
import { Avatar } from '@/ui/Avatar/Avatar'
import { Notice } from '@/ui/Notice/Notice'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { fetchRoster, meetingKeys } from './meetingApi'

/**
 * Una reunió, vista de dins.
 *
 * DUES DIFERÈNCIES AMB UNA FESTA, i cap de les dues és cosmètica.
 *
 * La primera: **es veu qui NO hi ve.** A una festa la llista pública són només
 * els sí, perquè «un llistat públic de qui ha dit que no assenyala la gent». A
 * una reunió és el contrari —«sou pocs i cal saber si hi haurà ningú»— i
 * saber-ho és el sentit de convocar-la.
 *
 * La segona: **dos botons i no tres.** En una reunió de tres persones un
 * «potser» no ajuda a decidir si es fa, i per tant no s'ofereix. El
 * sí/potser/no de les festes existeix perquè allà un potser és informació útil
 * per al càlcul de places; aquí no hi ha places.
 *
 * I ELS PUNTS ELS DÓNA TANCAR-LA. La frase ho diu perquè l'expectativa és
 * l'altra: a tot arreu més de l'app, confirmar és el que compta. «Qui diu que
 * hi serà i no hi és, no en fa.»
 */

const GUTTER = 'px-[var(--ds-gutter)]'

/** Qui hi serà, amb les cares i el recompte. */
export function MeetingRoster({ event }: { readonly event: EventRow }) {
  const { t } = useTranslation()

  const roster = useQuery({
    queryKey: meetingKeys.roster(event.id),
    queryFn: () => fetchRoster(event.id),
  })

  if (roster.isPending) {
    return (
      <Skeleton className={`pt-9 ${GUTTER}`}>
        <div className="flex items-center gap-5">
          <SkeletonBar w="w-[34px]" h="h-[34px]" className="flex-none rounded-round" />
          <SkeletonBar w="w-[46%]" h="h-[14px]" />
        </div>
      </Skeleton>
    )
  }

  const rows = roster.data ?? []
  if (rows.length === 0) return null

  // «Sou pocs i cal saber si hi haurà ningú» és la raó del disseny per
  // ensenyar qui NO hi ve, i deixa de valer quan no en sou pocs. Es decideix
  // per la mida i no per l'àmbit: una comi de dotze persones el primer any
  // també és poca gent, i una junta que creixi a vint deixaria de ser-ho.
  const byName = rows.length <= 12

  const closed = event.tancada_at !== null
  // Tancada, el que compta és qui hi era; oberta, qui ha dit que hi serà.
  const counted = closed
    ? rows.filter((r) => r.estado === 'asistio')
    : rows.filter((r) => r.estado === 'asistio' || r.estado === 'si')

  return (
    <section className={`pt-9 ${GUTTER}`}>
      <div className="flex items-center gap-5">
        <div className="flex items-center">
          {counted.slice(0, 5).map((row, index) => (
            <span
              key={row.user_id}
              className="relative rounded-full border-2 border-app [box-sizing:content-box]"
              style={{ marginLeft: index === 0 ? 0 : -11, zIndex: 5 - index }}
            >
              <Avatar src={row.avatar_url} size={34} />
            </span>
          ))}
        </div>
        <p className="flex-1 text-md font-bold text-fg-secondary [text-wrap:pretty]">
          {t(closed ? 'meeting.were' : 'meeting.willBe', {
            quants: counted.length,
            total: rows.length,
          })}
        </p>
      </div>

      {/* Per què aquí es veu qui no hi ve i a una festa no. Només quan de debò
          es veu: la raó que el disseny dóna és «sou pocs», i amb dos-cents
          socis deixa de ser certa. */}
      {byName ? (
        <p className="mt-5 text-sm leading-[1.4] text-fg-muted-lo [text-wrap:pretty]">
          {t('meeting.whoKnows')}
        </p>
      ) : null}

      {/* Qui ha dit què, un per línia. A una festa això no hi seria mai, i a
          una assemblea de tota la comi tampoc: la llista sencera de qui no ha
          contestat és una paret de dues-centes línies que diu «No va dir res»,
          i el que la fa útil en una reunió de tres persones és justament que
          en són tres. Amb la comi convocada es queda el recompte i les cares,
          com a una festa. */}
      {byName ? (
        <ul className="mt-7">
          {rows.map((row) => (
            <li
              key={row.user_id}
              className="flex min-h-[52px] items-center gap-5 border-b border-surface-4 py-5"
            >
              <Avatar src={row.avatar_url} size={32} />
              <span className="min-w-0 flex-1 truncate text-base font-semibold">{row.nombre}</span>
              <span
                className={
                  'flex-none text-sm-lo font-bold ' +
                  (row.estado === 'asistio'
                    ? 'text-success'
                    : row.estado === 'si'
                      ? 'text-fg-secondary'
                      : row.estado === 'no'
                        ? 'text-warning-deep'
                        : 'text-fg-muted-lo')
                }
              >
                {row.estado === 'asistio'
                  ? t('meeting.wasThere')
                  : row.estado === 'si'
                    ? t('meeting.yes')
                    : row.estado === 'no'
                      ? t('meeting.no')
                      : t('meeting.noAnswer')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/**
 * «Hi pots ser?»: dos botons.
 *
 * No reutilitza l'`AnswerBlock` de les festes perquè allà la pregunta és una
 * altra, hi ha tres respostes, i tot el bloc parla de places, llista d'espera i
 * confirmació —coses que una reunió no té. Un component amb sis interruptors
 * per servir les dues seria més difícil de llegir que dos components.
 */
export function MeetingAnswer({
  event,
  mine,
  pending,
  onAnswer,
}: {
  readonly event: EventRow
  readonly mine: string | null
  readonly pending: boolean
  readonly onAnswer: (a: Answer) => void
}) {
  const { t } = useTranslation()
  const said = mine === 'si' || mine === 'asistio' ? 'si' : mine === 'no' ? 'no' : null
  const punts = event.puntos

  return (
    <section className={`pt-12 ${GUTTER}`}>
      <h2 className="text-lg font-bold [text-wrap:pretty]">{t('meeting.canYou')}</h2>

      <Notice as="div" tone="neutral" className="mt-6">
        <p className="text-base font-bold [text-wrap:pretty]">
          {said === 'si'
            ? t('meeting.saidYes')
            : said === 'no'
              ? t('meeting.saidNo')
              : t('meeting.nothing')}
        </p>
        <p className="mt-3 text-sm text-fg-muted [text-wrap:pretty]">
          {said === 'si'
            ? punts > 0
              ? t('meeting.saidYesSub', { punts })
              : t('meeting.saidYesNoPoints')
            : said === 'no'
              ? t('meeting.saidNoSub')
              : t('meeting.nothingSub')}
        </p>
      </Notice>

      {/* Dos i no tres. El `grid-cols-2` i no el `ButtonGroup` de tres
          columnes: la fila té dues decisions i han de fer la mateixa amplada. */}
      <div className="mt-6 grid grid-cols-2 gap-[6px]">
        {(['si', 'no'] as const).map((a) => {
          const on = said === a
          return (
            <button
              key={a}
              type="button"
              disabled={pending}
              aria-pressed={on}
              onClick={() => {
                onAnswer(a satisfies Answer)
              }}
              className={
                'flex min-h-[56px] items-center justify-center px-4 py-4 font-body text-lg font-bold ' +
                '[text-wrap:balance] disabled:opacity-70 ' +
                (on || (a === 'si' && said === null)
                  ? 'bg-brand-cta text-on-brand'
                  : 'border-[1.5px] border-surface-7 bg-surface-1 text-fg-secondary')
              }
            >
              {t(a === 'si' ? 'meeting.yes' : 'meeting.no')}
            </button>
          )
        })}
      </div>
    </section>
  )
}

/**
 * L'acta.
 *
 * NO FA FALTA CAP PREDICAT PER A «NOMÉS QUAN ESTÀ TANCADA». L'acta és NULL
 * fins que la junta l'escriu en tancar la reunió, i per tant «hi ha acta» i
 * «està tancada» són el mateix estat vist de dues maneres. Amb la reunió
 * oberta surt el quadre que diu que sortirà; sense acta i tancada, no surt res.
 */
export function MeetingActa({ event }: { readonly event: EventRow }) {
  const { t } = useTranslation()
  const acta = event.acta

  if (acta !== null && acta.trim() !== '') {
    return (
      <section className={`pt-12 ${GUTTER}`}>
        <h2 className="eyebrow text-fg-muted">{t('meeting.acta')}</h2>
        <p className="mt-6 text-base leading-[1.45] text-fg-secondary [text-wrap:pretty]">{acta}</p>
      </section>
    )
  }

  // Tancada i sense acta: «si no n'hi ha, aquest bloc no hi és».
  if (event.tancada_at !== null) return null

  return (
    <section className={`pt-12 ${GUTTER}`}>
      <h2 className="eyebrow text-fg-muted">{t('meeting.acta')}</h2>
      <div className="mt-5 border border-dashed border-[var(--ds-border-input)] bg-surface-1 px-9 py-8">
        <p className="text-md leading-[1.4] text-fg-muted [text-wrap:pretty]">
          {t('meeting.actaEmpty')}
        </p>
      </div>
    </section>
  )
}
