import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getFix } from '@/features/checkin/api'

import type { Point } from './GeoMap'
import { Field, INPUT } from './formBits'
import { MIN_QUERY, type Place, searchPlaces } from './geocode'

/**
 * On és, preguntat una sola vegada.
 *
 * Abans hi havia dos camps: el text que llegeix la gent i un punt que es
 * triava tocant un mapa. Eren la mateixa pregunta feta dues vegades, i tocar
 * un mapa per dir una adreça és fer treballar algú perquè el programa no vol.
 *
 * Ara s'escriu l'adreça, surten resultats i se'n tria un. El text queda editable
 * després —la junta escriu «Sala Alfa» encara que el cercador digui el carrer—
 * i el punt es queda on el resultat el va deixar.
 *
 * TRES CAMINS AL MATEIX PARELL DE NÚMEROS, perquè el cercador és d'un tercer i
 * pot no ser-hi: el resultat de la cerca, el botó de «sóc aquí» quan ja hi ets
 * muntant-ho, i enganxar-hi el que has copiat d'on sigui. El mapa no és cap
 * d'ells: només ensenya on ha caigut.
 */

const GeoMap = lazy(() => import('./GeoMap'))

export interface Geo {
  readonly lat: number
  readonly lng: number
  readonly radi_m: number
}

const DEFAULT_RADIUS = 150
/**
 * Els extrems de la barra.
 *
 * La base n'accepta fins a dos mil, però amb dos quilòmetres de radi ja no
 * s'està comprovant res, i una barra que arriba tan lluny deixa la franja
 * útil —de cinquanta a tres-cents— en un pessic del costat esquerre que no es
 * pot afinar amb el dit.
 */
const MIN_RADIUS = 20
const MAX_RADIUS = 1000
/** Prou perquè no surti una petició per tecla, prou poc per no notar-ho. */
const DEBOUNCE_MS = 350

export function GeoPicker({
  where,
  onWhere,
  value,
  onChange,
}: {
  /** El text que llegeix la gent: `events.ubicacion`. */
  readonly where: string
  readonly onWhere: (text: string) => void
  readonly value: Geo | null
  readonly onChange: (g: Geo | null) => void
}) {
  const { t } = useTranslation()
  const [results, setResults] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const [failed, setFailed] = useState(false)
  const [coords, setCoords] = useState('')
  // Deixa de buscar quan s'acaba de triar: sense això, el text que hi posa la
  // tria torna a disparar la cerca i la llista reapareix sota el resultat.
  const quiet = useRef(false)

  const point: Point | null = value === null ? null : { lat: value.lat, lng: value.lng }
  const radius = value?.radi_m ?? DEFAULT_RADIUS
  // Derivat i no desat: així esborrar el camp amaga la llista sense que
  // ningú hagi d'escriure cap estat per aconseguir-ho.
  const visible = where.trim().length < MIN_QUERY ? [] : results

  useEffect(() => {
    if (quiet.current) {
      quiet.current = false
      return
    }
    // Res a fer amb dues lletres. Sense `setResults([])`: escriure estat de
    // manera síncrona dins d'un efecte encadena renders, i el que hi hagi a
    // `results` no es dibuixa igualment — ho decideix `visible`, més avall.
    if (where.trim().length < MIN_QUERY) return

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setSearching(true)
      void searchPlaces(where, controller.signal)
        .then(setResults)
        .finally(() => {
          setSearching(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [where])

  const choose = (place: Place) => {
    quiet.current = true
    onWhere(place.label)
    onChange({ lat: place.lat, lng: place.lng, radi_m: radius })
    setResults([])
    setCoords('')
    setFailed(false)
  }

  const here = async () => {
    setLocating(true)
    setFailed(false)
    try {
      const fix = await getFix()
      onChange({ lat: fix.lat, lng: fix.lng, radi_m: radius })
      setResults([])
      setCoords('')
    } catch {
      setFailed(true)
    } finally {
      setLocating(false)
    }
  }

  return (
    <section className="pb-9">
      <Field label={t('junta.form.where')} hint={t('junta.geo.hint')}>
        <div className="relative">
          <input
            type="text"
            value={where}
            placeholder={t('junta.geo.placeholder')}
            autoComplete="off"
            onChange={(e) => {
              onWhere(e.target.value)
            }}
            className={INPUT}
          />

          {visible.length === 0 ? null : (
            <ul className="absolute inset-x-0 top-full z-20 max-h-[260px] overflow-y-auto border-[1.5px] border-t-0 border-surface-7 bg-surface-1">
              {visible.map((place) => (
                <li key={`${place.label}${String(place.lat)}${String(place.lng)}`}>
                  <button
                    type="button"
                    onClick={() => {
                      choose(place)
                    }}
                    className="flex min-h-[52px] w-full flex-col items-start gap-1 border-b border-surface-4 px-6 py-5 text-left last:border-b-0"
                  >
                    <span className="text-md font-bold text-fg">{place.label}</span>
                    {place.detail === '' ? null : (
                      <span className="text-[12.5px] text-fg-muted">{place.detail}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>

      {/* Només un cop hi ha punt: un mapa buit al mig d'un formulari no diu res
          i ocupa dos-cents píxels. */}
      {point === null ? (
        <p className="text-sm text-fg-muted [text-wrap:pretty]">
          {searching ? t('junta.geo.searching') : t('junta.geo.noPoint')}
        </p>
      ) : (
        <Suspense
          fallback={
            <p className="grid h-[220px] place-items-center border border-surface-8 bg-surface-2 text-sm text-fg-muted">
              {t('state.loading')}
            </p>
          }
        >
          <GeoMap
            point={point}
            radius={radius}
            onPick={(p) => {
              onChange({ lat: p.lat, lng: p.lng, radi_m: radius })
            }}
          />
        </Suspense>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-5">
        <button
          type="button"
          disabled={locating}
          onClick={() => {
            void here()
          }}
          className="min-h-[48px] flex-none border border-surface-8 bg-surface-2 px-7 text-md font-bold text-fg disabled:opacity-60"
        >
          {locating ? t('junta.geo.locating') : t('junta.geo.here')}
        </button>
        {value === null ? null : (
          <>
            <span className="text-[12.5px] text-fg-muted tabular-nums">
              {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            </span>
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setCoords('')
              }}
              className="min-h-[48px] flex-none px-3 text-md font-bold text-[var(--ds-warning)]"
            >
              {t('junta.geo.clear')}
            </button>
          </>
        )}
      </div>

      {failed ? (
        <p role="alert" className="mt-5 text-sm font-bold text-[var(--ds-warning)] [text-wrap:pretty]">
          {t('junta.geo.noFix')}
        </p>
      ) : null}

      {/* El radi, arrossegant. Un número escrit et fa pensar quants metres és
          un bar; una barra amb el cercle movent-se al mapa al mateix temps
          t'ho ensenya. */}
      <div className="mt-8">
        <div className="flex items-baseline justify-between gap-5">
          <span className="eyebrow text-fg-muted">{t('junta.geo.radius')}</span>
          <span className="display text-lg tabular-nums text-fg">
            {t('junta.geo.metres', { count: radius })}
          </span>
        </div>
        <input
          type="range"
          min={MIN_RADIUS}
          max={MAX_RADIUS}
          step={10}
          value={radius}
          disabled={value === null}
          aria-label={t('junta.geo.radius')}
          onChange={(e) => {
            const next = Number(e.target.value)
            if (value !== null && Number.isFinite(next)) onChange({ ...value, radi_m: next })
          }}
          className="radius-slider mt-5 w-full disabled:opacity-40"
        />
        <p className="mt-4 text-[12.5px] text-fg-muted [text-wrap:pretty]">
          {t('junta.geo.radiusNote')}
        </p>
      </div>

      <div className="mt-8">
        <Field label={t('junta.geo.paste')} hint={t('junta.geo.pasteHint')}>
          <input
            type="text"
            inputMode="decimal"
            value={coords}
            placeholder="41.5381, 2.4445"
            onChange={(e) => {
              setCoords(e.target.value)
              const parsed = parsePair(e.target.value)
              if (parsed !== null) onChange({ ...parsed, radi_m: radius })
            }}
            className={INPUT}
          />
        </Field>
      </div>
    </section>
  )
}

/**
 * «41.5381, 2.4445», que és el que surt de copiar de qualsevol mapa.
 *
 * Es rebutja tot el que no siguin dos números dins de rang, en comptes de
 * quedar-se amb el que s'entengui: mig parell de coordenades és un punt en un
 * altre continent.
 */
function parsePair(text: string): { readonly lat: number; readonly lng: number } | null {
  const parts = text.split(/[,\s]+/).filter((p) => p !== '')
  if (parts.length !== 2) return null
  const lat = Number(parts[0])
  const lng = Number(parts[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}
