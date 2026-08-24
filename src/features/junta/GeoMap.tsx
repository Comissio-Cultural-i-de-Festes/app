import 'leaflet/dist/leaflet.css'

import * as L from 'leaflet'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * El mapa per triar on és un esdeveniment.
 *
 * L'única cosa de tota l'app que demana res a un tercer origen. Les fonts són
 * auto-allotjades precisament per no dependre'n, i aquí no hi ha manera: un
 * mapa on tocar vol rajoles, i les rajoles surten d'algun servidor. OpenStreet-
 * Map no demana compte ni clau, i la llicència vol una línia d'atribució.
 *
 * Es carrega mandrós i només aquí. Cap soci se'l descarrega: el formulari
 * d'esdeveniments és una pantalla de junta.
 *
 * Si les rajoles no arriben, el mapa queda gris i prou. El botó de «sóc aquí» i
 * el camp de coordenades que hi ha a sota segueixen funcionant, que és el que fa
 * que crear un esdeveniment no depengui d'això.
 */

export interface Point {
  readonly lat: number
  readonly lng: number
}

export function GeoMap({
  point,
  radius,
  onPick,
}: {
  readonly point: Point | null
  readonly radius: number
  readonly onPick: (p: Point) => void
}) {
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.Marker | null>(null)
  const ring = useRef<L.Circle | null>(null)
  // La crida viu en una ref perquè el mapa es crea un sol cop: posar-la a les
  // dependències de l'efecte el reconstruiria a cada tecla del formulari.
  const pick = useRef(onPick)
  useEffect(() => {
    pick.current = onPick
  }, [onPick])

  // El punt inicial es llegeix un sol cop, en crear el mapa. En una ref i no a
  // les dependències: amb `point` allà, cada tria destruïa el mapa i el
  // tornava a fer, que a més de car es menja el zoom que algú acabava de fer.
  const first = useRef(point)

  useEffect(() => {
    const el = host.current
    if (el === null || map.current !== null) return

    // Sense punt encara: el mapa s'obre on sigui i el primer toc el posa.
    const start = first.current ?? { lat: 41.5, lng: 2.4 }
    const instance = L.map(el, { attributionControl: true }).setView(
      [start.lat, start.lng],
      first.current === null ? 11 : 16,
    )

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      // La llicència d'OSM la demana, i no és decoració: és la condició d'ús.
      attribution: '© OpenStreetMap',
    }).addTo(instance)

    instance.on('click', (event: L.LeafletMouseEvent) => {
      pick.current({ lat: event.latlng.lat, lng: event.latlng.lng })
    })

    map.current = instance

    // Leaflet mesura el contenidor en crear-se, i dins d'un formulari que
    // encara s'està component surt de mida zero i les rajoles no es col·loquen.
    const settle = window.setTimeout(() => {
      instance.invalidateSize()
    }, 120)

    return () => {
      window.clearTimeout(settle)
      instance.remove()
      map.current = null
      marker.current = null
      ring.current = null
    }
  }, [])

  // El marcador i el cercle segueixen el punt i el radi sense refer el mapa.
  useEffect(() => {
    const instance = map.current
    if (instance === null) return

    if (point === null) {
      marker.current?.remove()
      ring.current?.remove()
      marker.current = null
      ring.current = null
      return
    }

    const at = L.latLng(point.lat, point.lng)
    if (marker.current === null) {
      marker.current = L.marker(at, { draggable: true }).addTo(instance)
      marker.current.on('dragend', () => {
        const moved = marker.current?.getLatLng()
        if (moved !== undefined) pick.current({ lat: moved.lat, lng: moved.lng })
      })
    } else {
      marker.current.setLatLng(at)
    }

    if (ring.current === null) {
      ring.current = L.circle(at, { radius, color: '#e23c34', weight: 2 }).addTo(instance)
      // El primer punt que arriba és el que centra la vista: quan ve de la
      // base arriba després que el mapa ja existeixi. Els següents no, o
      // arrossegar el marcador et faria saltar la vista a cada píxel.
      if (first.current === null) {
        first.current = point
        instance.setView(at, 16)
      }
    } else {
      ring.current.setLatLng(at)
      ring.current.setRadius(radius)
    }
  }, [point, radius])

  return (
    <div
      ref={host}
      role="application"
      aria-label={t('junta.geo.mapLabel')}
      className="mt-6 h-[260px] w-full border border-surface-8 bg-surface-2"
    />
  )
}

export default GeoMap
