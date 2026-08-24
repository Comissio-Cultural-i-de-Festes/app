import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { homeKeys } from '@/features/home/api'
import { insideKeys } from '@/features/event/insideApi'
import { photoKeys } from '@/features/photos/api'
import { formatTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import type { EventRow } from '@/lib/schema'

import { type Verdict, PositionFailure, checkInHere, getFix } from './api'

/**
 * «Sóc aquí».
 *
 * Substitueix la pregunta de «hi véns?» mentre la festa passa: quan ja hi ets,
 * dir si vindràs no és la pregunta.
 *
 * Un sol botó i un veredicte. Res es decideix aquí — la distància la calcula
 * el servidor, que és l'únic que sap on és l'esdeveniment — i cada resposta
 * porta a un consell diferent, perquè «no s'ha pogut» no és cap consell.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'locating' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'verdict'; readonly verdict: Verdict }
  | { readonly kind: 'nofix'; readonly why: PositionFailure['kind'] }
  /** Sense cobertura: apuntat a la cua i s'enviarà sol. */
  | { readonly kind: 'queued' }

export function CheckinBlock({
  event,
  onDone,
}: {
  readonly event: EventRow
  /**
   * Avisa que ja s'ha fitxat.
   *
   * Cal perquè fitxar canvia `mine` a `asistio`, i el detall decideix amb això
   * si aquest bloc hi va. Sense l'avís, el bloc es desmunta amb el veredicte a
   * dins: prems, funciona, i desapareix abans que puguis llegir-lo o fer-te la
   * foto.
   */
  readonly onDone: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.language)
  const queryClient = useQueryClient()
  const [state, setState] = useState<State>({ kind: 'idle' })

  const go = useMutation({
    // Sense això no s'executa gens sense cobertura, i és justament el cas
    // per al qual existeix. React Query, per defecte, posa les mutacions en
    // pausa quan `navigator.onLine` diu que no: no falla, no llança, no
    // crida `mutationFn` — no fa res. La cua d'IndexedDB viu a dins, o sigui
    // que la pausa se l'empassa sencera.
    networkMode: 'always',
    mutationFn: async () => {
      setState({ kind: 'locating' })
      const fix = await getFix()
      setState({ kind: 'sending' })
      return checkInHere(event.id, fix)
    },
    onSuccess: async (verdict) => {
      setState({ kind: 'verdict', verdict })
      if (verdict.estat === 'fet' || verdict.estat === 'ja_hi_ets') {
        onDone()
        // La llista de qui hi ha dins, el recompte del detall i les nits del
        // perfil canvien totes tres amb això.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: insideKeys.list(event.id) }),
          queryClient.invalidateQueries({ queryKey: homeKeys.attendances([event.id]) }),
          queryClient.invalidateQueries({ queryKey: photoKeys.nights() }),
        ])
      }
    },
    onError: (cause) => {
      if (cause instanceof PositionFailure) {
        setState({ kind: 'nofix', why: cause.kind })
        return
      }
      // Qualsevol altra cosa vol dir que no hi ha arribat: el fitxatge ja és a
      // la cua i sortirà sol quan torni la xarxa.
      setState({ kind: 'queued' })
    },
  })

  const busy = state.kind === 'locating' || state.kind === 'sending'

  return (
    <section className={`pt-12 ${GUTTER}`}>
      <h2 className="display text-[27px] leading-[0.98] tracking-[-0.042em] [text-wrap:balance]">
        {t('checkin.title')}
      </h2>
      <p className="mt-5 text-base text-fg-secondary [text-wrap:pretty]">{t('checkin.lede')}</p>

      {state.kind === 'verdict' && state.verdict.estat === 'fet' ? (
        <Done event={event} punts={state.verdict.punts} />
      ) : state.kind === 'verdict' && state.verdict.estat === 'ja_hi_ets' ? (
        <Note tone="ok">
          {t('checkin.already', { hora: formatTime(new Date(state.verdict.quan), locale) })}
        </Note>
      ) : (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              go.mutate()
            }}
            className="mt-8 flex min-h-[58px] w-full items-center justify-center bg-brand-cta px-8 py-7 text-lg font-bold text-on-brand [text-wrap:balance] disabled:opacity-60"
          >
            {state.kind === 'locating'
              ? t('checkin.locating')
              : state.kind === 'sending'
                ? t('checkin.sending')
                : t('checkin.here')}
          </button>

          {state.kind === 'queued' ? <Note tone="warn">{t('checkin.queued')}</Note> : null}

          {state.kind === 'nofix' ? (
            <Note tone="warn">{t(`checkin.nofix.${state.why}`)}</Note>
          ) : null}

          {state.kind === 'verdict' && state.verdict.estat === 'lluny' ? (
            <Note tone="warn">{t('checkin.far', { metres: state.verdict.metres })}</Note>
          ) : null}

          {state.kind === 'verdict' && state.verdict.estat === 'tancat' ? (
            <Note tone="warn">{t('checkin.closed')}</Note>
          ) : null}

          {state.kind === 'verdict' && state.verdict.estat === 'sense_lloc' ? (
            <Note tone="warn">{t('checkin.noPlace')}</Note>
          ) : null}

          {state.kind === 'verdict' && state.verdict.estat === 'no_hi_es' ? (
            <Note tone="warn">{t('checkin.gone')}</Note>
          ) : null}
        </>
      )}
    </section>
  )
}

/** Fitxat. Els punts ja hi són, i la foto s'ofereix sense obligar. */
function Done({ event, punts }: { readonly event: EventRow; readonly punts: number }) {
  const { t } = useTranslation()
  return (
    <>
      <p
        role="status"
        className="mt-8 border-l-[3px] border-success bg-surface-2 px-7 py-6 text-md font-bold text-fg [text-wrap:pretty]"
      >
        {punts > 0 ? t('checkin.done', { count: punts }) : t('checkin.doneNoPoints')}
      </p>
      <Link
        to={`/perfil/nits/${event.id}/camera?half=entrada`}
        className="mt-6 flex min-h-[56px] w-full items-center justify-center border border-surface-8 bg-surface-2 px-8 py-7 text-md font-bold text-fg no-underline [text-wrap:balance]"
      >
        {t('checkin.takePhoto')}
      </Link>
      <p className="mt-5 text-[12.5px] text-fg-muted [text-wrap:pretty]">
        {t('checkin.photoNote')}
      </p>
    </>
  )
}

function Note({
  tone,
  children,
}: {
  readonly tone: 'ok' | 'warn'
  readonly children: React.ReactNode
}) {
  return (
    <p
      role="status"
      className={
        'mt-6 border-l-[3px] px-7 py-6 text-md [text-wrap:pretty] ' +
        (tone === 'ok'
          ? 'border-success bg-surface-2 text-fg'
          : 'border-warning bg-surface-1 text-fg-secondary')
      }
    >
      {children}
    </p>
  )
}
