/**
 * Buscar una adreça.
 *
 * Photon, de komoot, sobre dades d'OpenStreetMap: sense clau, sense compte i
 * sense targeta, que és el pressupost. Permet escriure i que et vagin sortint
 * resultats, cosa que el Nominatim oficial prohibeix expressament a la seva
 * política d'ús.
 *
 * PER QUÈ NO GOOGLE. Els termes de Maps Platform només deixen desar una
 * latitud i una longitud trenta dies. Aquesta app guarda el punt d'un local
 * per sempre i el llegeix mesos després per deixar fitxar, o sigui que
 * complir-los voldria dir guardar el `place_id` i tornar a preguntar-li les
 * coordenades a cada fitxatge: una crida de pagament al camí que ha de
 * funcionar en una masia sense cobertura.
 *
 * ÉS UN SERVEI D'ALGÚ ALTRE I POT NO SER-HI. Per això no és l'única manera de
 * posar el punt: el botó de «sóc aquí» i el camp de coordenades funcionen amb
 * la cerca caiguda, i cap dels dos surt d'aquest fitxer.
 */

const ENDPOINT = 'https://photon.komoot.io/api/'

/** Prou lletres perquè la pregunta signifiqui alguna cosa. */
export const MIN_QUERY = 3

export interface Place {
  readonly label: string
  readonly detail: string
  readonly lat: number
  readonly lng: number
}

interface Feature {
  readonly geometry?: { readonly coordinates?: readonly number[] }
  readonly properties?: Record<string, unknown>
}

function text(props: Record<string, unknown>, key: string): string | null {
  const value = props[key]
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * El nom que es veurà, i la línia de sota.
 *
 * El nom del local primer quan n'hi ha: la junta busca «Sala Alfa» i no
 * «Carrer de no sé què 12», encara que el segon sigui el que la fila desa.
 */
function describe(props: Record<string, unknown>): { label: string; detail: string } {
  const name = text(props, 'name')
  const street = text(props, 'street')
  const number = text(props, 'housenumber')
  const city = text(props, 'city') ?? text(props, 'town') ?? text(props, 'village')
  const road = street === null ? null : number === null ? street : `${street} ${number}`

  const label = name ?? road ?? city ?? ''
  const detail = [name === null ? null : road, city, text(props, 'state')]
    .filter((p): p is string => p !== null && p !== label)
    .join(' · ')

  return { label, detail }
}

/**
 * Busca, i si res va bé torna una llista buida.
 *
 * Mai llança: la cerca és una comoditat i no el camí únic, i una pantalla que
 * es trenca perquè un servei de tercers no contesta seria pitjor que una
 * llista sense resultats.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim()
  if (q.length < MIN_QUERY) return []

  try {
    const url = new URL(ENDPOINT)
    url.searchParams.set('q', q)
    url.searchParams.set('limit', '6')
    // La comi és d'aquí: prioritzar el que és a prop estalvia que «la sala»
    // surti primer a Ohio. No filtra, només ordena.
    url.searchParams.set('lat', '41.5')
    url.searchParams.set('lon', '2.4')

    const response = await fetch(url, signal === undefined ? {} : { signal })
    if (!response.ok) return []

    const body: unknown = await response.json()
    const features = (body as { features?: readonly Feature[] } | null)?.features ?? []

    // Photon torna el mateix lloc més d'un cop —una parada, l'edifici, el
    // polígon— i una llista amb «Plaça de Catalunya» quatre vegades no ajuda
    // ningú a triar.
    const seen = new Set<string>()

    return features
      .map((f) => {
        const coords = f.geometry?.coordinates
        const lng = coords?.[0]
        const lat = coords?.[1]
        if (typeof lat !== 'number' || typeof lng !== 'number') return null
        const { label, detail } = describe(f.properties ?? {})
        if (label === '') return null
        return { label, detail, lat, lng }
      })
      .filter((p): p is Place => p !== null)
      .filter((p) => {
        const key = `${p.label}|${p.detail}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  } catch {
    // Inclou l'AbortError de cada tecla: una cerca cancel·lada no és un error.
    return []
  }
}
