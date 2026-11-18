import { afterEach, describe, expect, it, vi } from 'vitest'

import { UnreadableImage, avatarImage, galleryImage, shrinkImage } from './storage'

/**
 * `shrinkImage`, i sobretot que no torni mai el fitxer tal com va arribar.
 *
 * El defecte que això fixa: hi havia un camí ràpid que, si la imatge ja cabia i
 * no calia escalar-la, se saltava el canvas i pujava el fitxer original amb les
 * metadades EXIF a dins —model del mòbil i, amb la ubicació encesa, les
 * coordenades d'on es va fer la foto—. Afectava els avatars i les portades, que
 * són justament els dos casos on la imatge surt del carret.
 *
 * jsdom no porta canvas, així que aquí es fingeixen les tres peces del camí:
 * `createImageBitmap`, `getContext` i `toBlob`. El que es comprova no és la
 * imatge que en surt, que seria provar el navegador, sinó **la decisió**: si hi
 * passa pel damunt o no. Que és exactament el que fallava.
 */

interface Fingit {
  readonly toBlob: ReturnType<typeof vi.fn>
  readonly drawImage: ReturnType<typeof vi.fn>
}

function muntaCanvas(surt: Blob | null = new Blob(['jpeg'], { type: 'image/jpeg' })): Fingit {
  const drawImage = vi.fn()
  const toBlob = vi.fn((cb: (b: Blob | null) => void) => {
    cb(surt)
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(toBlob)
  return { toBlob, drawImage }
}

function bitmap(width: number, height: number): void {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.resolve({ width, height, close: vi.fn() })),
  )
}

/** Un fitxer de la mida que es digui, sense haver-lo de construir de debò. */
function fitxer(bytes: number, type = 'image/jpeg'): File {
  const file = new File(['x'], 'del-carret.jpg', { type })
  Object.defineProperty(file, 'size', { value: bytes })
  return file
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('shrinkImage', () => {
  it('re-codifica una foto petita que no cal escalar', async () => {
    bitmap(1200, 900) // per sota de MAX_EDGE: no cal escalar
    const canvas = muntaCanvas()
    const original = fitxer(500_000) // i per sota dels dos megues

    const out = await shrinkImage(original)

    expect(canvas.drawImage).toHaveBeenCalled()
    expect(out).not.toBe(original)
    expect(out.type).toBe('image/jpeg')
  })

  // El cas de debò del defecte: 1,5 MB del carret d'un mòbil, prou petit per a
  // saltar-se el camí lent i prou gran per a portar EXIF sencer.
  it('re-codifica també la que just cabia pel camí ràpid', async () => {
    bitmap(1600, 1200) // exactament MAX_EDGE: scale === 1
    const canvas = muntaCanvas()
    const original = fitxer(1_500_000)

    const out = await shrinkImage(original)

    expect(canvas.drawImage).toHaveBeenCalled()
    expect(out).not.toBe(original)
  })

  it('i encongeix la que no hi cap', async () => {
    bitmap(4000, 3000)
    const canvas = muntaCanvas()

    await shrinkImage(fitxer(9_000_000))

    expect(canvas.drawImage).toHaveBeenCalled()
  })

  it('un PNG petit tampoc se salta el canvas', async () => {
    bitmap(800, 600)
    const canvas = muntaCanvas()
    const original = fitxer(200_000, 'image/png')

    const out = await shrinkImage(original)

    expect(canvas.drawImage).toHaveBeenCalled()
    expect(out).not.toBe(original)
  })

  // Un PNG o un WebP poden portar transparència i el JPEG no en té: si es
  // codifiquessin a JPEG, un cartell amb fons transparent sortiria negre.
  it('i el que pot portar alfa surt en WebP, no en JPEG', async () => {
    bitmap(800, 600)
    const canvas = muntaCanvas()

    await shrinkImage(fitxer(200_000, 'image/png'))
    expect(canvas.toBlob.mock.calls[0]?.[1]).toBe('image/webp')

    canvas.toBlob.mockClear()
    await shrinkImage(fitxer(200_000, 'image/webp'))
    expect(canvas.toBlob.mock.calls[0]?.[1]).toBe('image/webp')
  })

  it('i una foto de càmera segueix sortint en JPEG', async () => {
    bitmap(4000, 3000)
    const canvas = muntaCanvas()

    await shrinkImage(fitxer(9_000_000, 'image/jpeg'))

    expect(canvas.toBlob.mock.calls[0]?.[1]).toBe('image/jpeg')
  })

  // Un costat que arrodoneix a zero dona un canvas de dimensió zero, `toBlob`
  // torna null i sortiríem amb l'original i les metadades a dins.
  it('un retall panoràmic no acaba amb un canvas de zero píxels', async () => {
    bitmap(5000, 1)
    const canvas = muntaCanvas()

    await shrinkImage(fitxer(300_000))

    expect(canvas.drawImage).toHaveBeenCalled()
    const dibuixat = canvas.drawImage.mock.calls[0] as unknown[]
    expect(dibuixat[3]).toBeGreaterThanOrEqual(1)
    expect(dibuixat[4]).toBeGreaterThanOrEqual(1)
  })

  // La degradació que es queda: sense canvas no hi ha manera de treure res, i
  // pujar l'original és millor que no pujar. És l'únic camí que conserva les
  // metadades, i cal un navegador trencat per a arribar-hi.
  it('si el canvas no dona blob, torna l original en lloc de petar', async () => {
    bitmap(1200, 900)
    muntaCanvas(null)
    const original = fitxer(500_000)

    expect(await shrinkImage(original)).toBe(original)
  })

  it('un fitxer que el navegador no sap llegir es para abans de pujar-se', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new Error('no decoder'))),
    )

    await expect(shrinkImage(fitxer(3_000_000, 'image/heic'))).rejects.toBeInstanceOf(
      UnreadableImage,
    )
  })
})

describe('galleryImage', () => {
  // La foto d'una prova surt del carret i passa per aquí. Un error cru de
  // `createImageBitmap` no el reconeix ningú, i la pantalla el llegiria com
  // una xarxa caiguda.
  it('un fitxer il·legible es diu pel seu nom', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new Error('no decoder'))),
    )

    await expect(galleryImage(fitxer(3_000_000, 'image/heic'))).rejects.toBeInstanceOf(
      UnreadableImage,
    )
  })
})

describe('avatarImage', () => {
  // Un avatar es pinta en un cercle de 112 px com a molt. Abans passava per
  // `shrinkImage` i pujava a 1600 px: quatre-cents kB per a una cara de 40.
  it('retalla el centre en quadrat abans d encongir', async () => {
    bitmap(4000, 3000)
    const canvas = muntaCanvas()

    await avatarImage(fitxer(9_000_000))

    const args = canvas.drawImage.mock.calls[0] as number[]
    // drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh)
    expect(args.slice(1)).toEqual([500, 0, 3000, 3000, 0, 0, 384, 384])
  })

  it('una foto vertical es retalla pel mig cap amunt i avall', async () => {
    bitmap(1000, 2000)
    const canvas = muntaCanvas()

    await avatarImage(fitxer(3_000_000, 'image/png'))

    const args = canvas.drawImage.mock.calls[0] as number[]
    expect(args.slice(1)).toEqual([0, 500, 1000, 1000, 0, 0, 384, 384])
  })

  it('no amplia una foto que ja és més petita que el sostre', async () => {
    bitmap(200, 150)
    const canvas = muntaCanvas()

    await avatarImage(fitxer(40_000))

    const args = canvas.drawImage.mock.calls[0] as number[]
    expect(args.slice(1)).toEqual([25, 0, 150, 150, 0, 0, 150, 150])
  })

  // Sempre JPEG, també un PNG: el cubell d'avatars no l'accepta, i així
  // també se'n van les metadades.
  it('sempre surt en JPEG', async () => {
    bitmap(800, 800)
    const canvas = muntaCanvas()

    const out = await avatarImage(fitxer(200_000, 'image/png'))

    expect(canvas.toBlob.mock.calls[0]?.[1]).toBe('image/jpeg')
    expect(out.type).toBe('image/jpeg')
  })

  it('un fitxer il·legible es diu pel seu nom', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new Error('no decoder'))),
    )

    await expect(avatarImage(fitxer(3_000_000, 'image/heic'))).rejects.toBeInstanceOf(
      UnreadableImage,
    )
  })
})
