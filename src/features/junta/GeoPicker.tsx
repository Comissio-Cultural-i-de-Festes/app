import { Suspense, lazy, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getFix } from '@/features/checkin/api'

import type { Point } from './GeoMap'
import { Field, INPUT } from './formBits'

/**
 * On és l'esdeveniment, per poder-hi fitxar.
 *
 * Tres maneres d'omplir el mateix parell de números, perquè les tres passen:
 * tocar el mapa quan el crees des de casa, prémer «sóc aquí» quan ja hi estàs
 * muntant l'activitat, i enganxar-hi el que has copiat del Google Maps.
 *
 * El mapa arriba per separat i només quan hi ha alguna cosa a mostrar: és
 * l'única llibreria de tota l'app i no ha d'entrar al paquet que descarrega un
 * soci. Les altres dues maneres funcionen igual si no arriba, que és el que fa
 * que crear un esdeveniment no depengui d'un servidor de rajoles.
 */

const GeoMap = lazy(() => import('./GeoMap'))

export interface Geo {
  readonly lat: number
  readonly lng: number
  readonly radi_m: number
}

const DEFAULT_RADIUS = 150

export function GeoPicker({
  value,
  onChange,
}: {
  readonly value: Geo | null
  readonly onChange: (g: Geo | null) => void
}) {
  const { t } = useTranslation()
  const [locating, setLocating] = useState(false)
  const [failed, setFailed] = useState(false)
  // El text es guarda a part del valor: mentre s'escriu «41.5, » no és cap
  // parell de números, i esborrar-ho a mig teclejar seria impossible d'omplir.
  const [typed, setTyped] = useState('')

  const point: Point | null = value === null ? null : { lat: value.lat, lng: value.lng }
  const radius = value?.radi_m ?? DEFAULT_RADIUS

  const setPoint = (p: Point) => {
    onChange({ lat: p.lat, lng: p.lng, radi_m: radius })
    setTyped('')
    setFailed(false)
  }

  const here = async () => {
    setLocating(true)
    setFailed(false)
    try {
      const fix = await getFix()
      setPoint({ lat: fix.lat, lng: fix.lng })
    } catch {
      setFailed(true)
    } finally {
      setLocating(false)
    }
  }

  return (
    <section className="pt-9">
      <h2 className="eyebrow text-fg-muted">{t('junta.geo.title')}</h2>
      <p className="mt-5 text-sm text-fg-secondary [text-wrap:pretty]">{t('junta.geo.lede')}</p>

      <Suspense
        fallback={
          <p className="mt-6 grid h-[260px] place-items-center border border-surface-8 bg-surface-2 text-sm text-fg-muted">
            {t('state.loading')}
          </p>
        }
      >
        <GeoMap point={point} radius={radius} onPick={setPoint} />
      </Suspense>

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
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setTyped('')
            }}
            className="min-h-[48px] flex-none px-3 text-md font-bold text-[var(--ds-warning)]"
          >
            {t('junta.geo.clear')}
          </button>
        )}
      </div>

      {failed ? (
        <p role="alert" className="mt-5 text-sm font-bold text-[var(--ds-warning)] [text-wrap:pretty]">
          {t('junta.geo.noFix')}
        </p>
      ) : null}

      <div className="mt-7 grid grid-cols-2 gap-5">
        <Field label={t('junta.geo.paste')}>
          <input
            type="text"
            inputMode="decimal"
            value={typed === '' && value !== null ? `${String(value.lat)}, ${String(value.lng)}` : typed}
            placeholder="41.5381, 2.4445"
            onChange={(e) => {
              setTyped(e.target.value)
              const parsed = parsePair(e.target.value)
              if (parsed !== null) onChange({ ...parsed, radi_m: radius })
            }}
            className={INPUT}
          />
        </Field>
        <Field label={t('junta.geo.radius')}>
          <input
            type="number"
            min={20}
            max={2000}
            step={10}
            value={radius}
            disabled={value === null}
            onChange={(e) => {
              const next = Number(e.target.value)
              if (value !== null && Number.isFinite(next)) {
                onChange({ ...value, radi_m: Math.min(2000, Math.max(20, Math.round(next))) })
              }
            }}
            className={INPUT}
          />
        </Field>
      </div>
      <p className="mt-4 text-[12.5px] text-fg-muted [text-wrap:pretty]">
        {t('junta.geo.radiusNote')}
      </p>
    </section>
  )
}

/**
 * «41.5381, 2.4445», que és el que surt de copiar del Google Maps.
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
