import 'leaflet/dist/leaflet.css'

import * as L from 'leaflet'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * On ha caigut el punt.
 *
 * Ja no és on es tria —això ho fa el cercador d'adreces— sinó on es comprova.
 * Es pot arrossegar el marcador per ajustar, perquè una adreça et deixa al
 * carrer i la porta és quinze metres més enllà, però ningú ha de trobar un
 * lloc tocant un mapa.
 *
 * LES RAJOLES SÓN DE CARTO i no les crues d'OpenStreetMap. Les d'OSM són
 * carreteres grogues i boscos verds sobre una app negra: desentonen amb tot.
 * L'estil `voyager` és el desaturat i tranquil que s'espera d'un mapa avui, no
 * vol clau ni compte, i l'atribució és la condició d'ús.
 *
 * Clar i no fosc, tot i que l'app és negra. El `dark_all` de CARTO està pensat
 * com a fons on posar-hi dades brillants a sobre: sobre un panell fosc no es
 * distingeix de res, que és canviar lleig per invisible. Un rectangle clar
 * dins d'una pantalla fosca es llegeix com el que és, un mapa.
 *
 * EL MARCADOR EL DIBUIXEM NOSALTRES. El de Leaflet és un PNG que la llibreria
 * demana per un camí relatiu que cap empaquetador resol: a `dev` funciona
 * perquè Vite serveix `node_modules`, i al build la imatge no hi és i surt
 * trencada. Un `divIcon` no té aquest problema i a més surt del color de marca.
 *
 * Es carrega mandrós i només aquí: cap soci se'l descarrega mai.
 */

export interface Point {
  readonly lat: number
  readonly lng: number
}

/**
 * El pin, dibuixat amb HTML.
 *
 * Un cercle amb vora blanca i una ombra a sota, que és el que fa que se situï
 * sobre un punt i no suri. `iconAnchor` al centre i no a la punta: aquest no
 * en té.
 */
const PIN = L.divIcon({
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html:
    '<span style="display:block;width:22px;height:22px;border-radius:50%;' +
    'background:#e23c34;border:3px solid #fff;' +
    'box-shadow:0 2px 8px rgba(0,0,0,0.6)"></span>',
})

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

  // El punt de sortida, llegit un sol cop en crear el mapa. En una ref i no a
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

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
      // Les dues, i no és decoració: és la condició d'ús de totes dues.
      attribution: '© OpenStreetMap · © CARTO',
    }).addTo(instance)

    instance.on('click', (event: L.LeafletMouseEvent) => {
      pick.current({ lat: event.latlng.lat, lng: event.latlng.lng })
    })

    map.current = instance

    // Leaflet mesura el contenidor en crear-se i col·loca les rajoles a partir
    // d'aquella mida. Si en aquell moment encara és zero —el tros del mapa
    // arriba mandrós, el formulari s'està component, la font encara no ha
    // caigut— les rajoles es descarreguen i queden posades fora de la vista:
    // el mapa surt buit amb els controls a sobre.
    //
    // Un observador i no un `setTimeout`: un temps endevinat encerta a la
    // màquina on el proves i falla a la que va justa, que és exactament com
    // això va arribar a producció la primera vegada.
    const watcher = new ResizeObserver(() => {
      instance.invalidateSize()
    })
    watcher.observe(el)

    return () => {
      watcher.disconnect()
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
      marker.current = L.marker(at, { draggable: true, icon: PIN }).addTo(instance)
      marker.current.on('dragend', () => {
        const moved = marker.current?.getLatLng()
        if (moved !== undefined) pick.current({ lat: moved.lat, lng: moved.lng })
      })
    } else {
      marker.current.setLatLng(at)
    }

    if (ring.current === null) {
      ring.current = L.circle(at, {
        radius,
        color: '#e23c34',
        weight: 2,
        fillOpacity: 0.12,
      }).addTo(instance)
    } else {
      ring.current.setLatLng(at)
      ring.current.setRadius(radius)
    }

    // La vista segueix el punt quan el punt se'n va de la vista, i no altrament.
    //
    // Les dues coses que mouen el punt volen respostes contràries: una tria del
    // cercador el pot posar a trenta quilòmetres i el mapa hi ha d'anar,
    // mentre que arrossegar el marcador el mou uns píxels i recentrar a cada
    // moviment el faria lliscar sota el dit. Mirar si encara hi cap distingeix
    // els dos casos sense haver de saber qui l'ha mogut: arrossegant no en pots
    // sortir, perquè arrossegues dins de la vista.
    if (!instance.getBounds().contains(at)) instance.setView(at, 16)
  }, [point, radius])

  return (
    <div
      ref={host}
      role="application"
      aria-label={t('junta.geo.mapLabel')}
      className="mt-6 h-[220px] w-full border border-surface-8 bg-surface-2"
    />
  )
}

export default GeoMap
