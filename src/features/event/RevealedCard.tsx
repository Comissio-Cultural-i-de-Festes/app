import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { homeKeys, horizonIso } from '@/features/home/api'
import { useAnswer } from '@/features/home/useHome'
import { formatDateTime } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { unwrapAs } from '@/lib/db'
import { errorKey } from '@/lib/errors'
import type { EventRow } from '@/lib/schema'
import { supabase } from '@/lib/supabase'

import { eventKeys } from './api'

/**
 * «Ja es pot dir»: el que es va revelar mentre no miraves.
 *
 * LA XARXA DE SEGURETAT DE LA FUNCIÓ 4. «Avisa'm» promet dues coses, i només
 * una depèn d'una notificació. La que s'ha de complir sempre és la segona
 * —seràs dels primers a saber-ho— perquè el push es perd: el permís es
 * denega, el telèfon està en silenci, iOS descarta la subscripció al cap
 * d'unes setmanes. Això surt tant si l'avís ha arribat com si no.
 *
 * TRES COSES QUE JA ES GUARDEN i cap estat nou: hi ha una fila teva a
 * `event_interest`, l'esdeveniment ja està revelat, i encara no has contestat.
 * Apuntar-s'hi crea la fila d'assistència i la targeta desapareix sola; una
 * columna de «vist» s'hauria d'escriure des del client i quedaria mal posada el
 * dia que aquella petició fallés.
 *
 * A DALT DE TOT I NO ENTRE ELS AVISOS. Els tres candidats de `notices` es
 * barallen per l'únic lloc que hi ha *sobre el hero*; això va **abans** del
 * hero, perquè és la resposta a una cosa que aquesta persona va demanar
 * explícitament. És l'única cosa de l'app que té aquest lloc, i per això no fa
 * falta cap regla de prioritat.
 *
 * `role="status"` SÍ: apareix mentre algú mira la pantalla —just quan obre
 * l'app— i és exactament el cas que la nota de `ui/Notice` descriu com el que
 * s'ha d'anunciar.
 */

const GUTTER = 'px-[var(--ds-gutter)]'

const COLUMNS =
  'id, titulo, tipo, starts_at, teaser, reveal_at, revelat, plazas, precio_cents, ' +
  'puntos, published, cal_confirmacio, te_cotxes, descripcion, ubicacion, ends_at, cover_url, ' +
  'transport_info, abast, tancada_at, acta'

const revealedKeys = {
  mine: () => ['event', 'revealed'] as const,
}

/**
 * Els que s'han revelat i encara no has contestat.
 *
 * La funció torna identificadors i la vista la resta: per a un esdeveniment
 * revelat, `events_public` ja dóna el títol. Dues peticions i no una, perquè
 * `event_interest` no es pot llegir des del client i `events_public` sí.
 */
async function fetchRevealed(): Promise<EventRow[]> {
  const { data, error } = await supabase.rpc('my_revealed_interests')
  if (error) throw error
  const ids = data ?? []
  if (ids.length === 0) return []

  return unwrapAs<EventRow[]>(
    supabase.from('events_public').select(COLUMNS).in('id', ids).order('starts_at'),
  )
}

export function RevealedCard() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const client = useQueryClient()
  const answer = useAnswer()

  const revealed = useQuery({ queryKey: revealedKeys.mine(), queryFn: fetchRevealed })

  // Un esquelet no: això surt de tant en tant i gairebé mai. Una silueta que
  // apareix i desapareix a cada obertura de l'app seria un salt de mig segon a
  // dalt de la pantalla per a una targeta que normalment no hi és.
  if (revealed.isPending || revealed.isError) return null

  const event = revealed.data?.[0]
  if (event === undefined) return null

  const places = event.plazas === null ? null : t('home.places.of', { total: event.plazas })
  const sub = [formatDateTime(new Date(event.starts_at), locale), places]
    .filter((part): part is string => part !== null)
    .join(' · ')

  return (
    <section role="status" className={`pt-1 ${GUTTER}`}>
      <div className="border-[1.5px] border-brand-cta bg-app">
        <div className="flex items-center gap-6 bg-brand-tint px-7 py-6">
          <span aria-hidden="true" className="size-[9px] flex-none rounded-full bg-brand" />
          <p className="eyebrow-sm flex-1 text-brand-label">{t('event.revealed.now')}</p>
        </div>

        <div className="p-7">
          <Link to={`/esdeveniment/${event.id}`} className="block no-underline">
            <p className="display text-d-sm leading-[0.92] tracking-[-0.05em] text-fg [text-wrap:balance]">
              {event.titulo}
            </p>
            <p className="mt-4 text-sm text-fg-muted">{sub}</p>
          </Link>

          <button
            type="button"
            disabled={answer.isPending}
            onClick={() => {
              // La invalidació va al `onSuccess` de la crida i no aquí al
              // costat del `mutate`. Amb les dues coses juntes la targeta es
              // quedava a la pantalla: `mutate` no espera, o sigui que el
              // refetch sortia abans que la fila d'assistència existís, veia
              // l'interès encara pendent, i després ja no hi havia res que el
              // tornés a demanar. Es va veure a la pantalla i no al tipus.
              answer.mutate(
                { eventId: event.id, estado: 'si' },
                {
                  onSuccess: () => {
                    void client.invalidateQueries({ queryKey: revealedKeys.mine() })
                    void client.invalidateQueries({ queryKey: eventKeys.one(event.id) })
                    void client.invalidateQueries({
                      queryKey: homeKeys.upcoming(horizonIso()),
                    })
                  },
                },
              )
            }}
            className="mt-7 flex min-h-[50px] w-full items-center justify-center rounded-cta border-0 bg-brand-cta px-7 font-body text-lg font-bold text-on-brand disabled:opacity-45 [text-wrap:balance]"
          >
            {answer.isPending ? t('state.updating') : t('home.cta.join')}
          </button>

          {answer.error ? (
            <p role="alert" className="mt-4 text-md font-bold text-error [text-wrap:pretty]">
              {t(errorKey(answer.error))}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
