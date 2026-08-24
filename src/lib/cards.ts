import { brand } from '@/config/brand'

/**
 * The Stories cards, drawn to a canvas.
 *
 * 1080×1920, which is what Instagram and TikTok want, and no DOM: an off-screen
 * canvas is the only way to produce a file the share sheet can take. Everything
 * here is measured against that fixed frame, so the numbers are the drawings'
 * numbers and not ratios of anything.
 *
 * THE FONT HAS TO BE THERE FIRST. The faces are self-hosted and are not in the
 * service worker's precache — only a runtime CacheFirst rule — so on a first
 * visit they are a network request. A canvas asked for a font it does not have
 * silently uses the fallback and the card comes out in the wrong face, which is
 * the one failure nobody notices until it is on somebody's story. So every
 * draw awaits `document.fonts.load` for the exact sizes it is about to use:
 * the API is per size, and loading "100px" does not load "208px".
 *
 * THE COLOURS COME FROM THE TOKENS, resolved through the canvas itself. The
 * brand is configuration — the whole point of `config/brand` — so reading a
 * hardcoded red here would be the one hardcoded thing in the app. But a token
 * is `oklch(...)`, some of it deliberately outside sRGB, and a canvas that
 * cannot parse a colour string does not throw: it keeps whatever `fillStyle`
 * had, and the card comes out in the previous colour. So each one is set
 * against a sentinel and checked, and anything the browser will not take falls
 * back to a value written down here.
 */

export const CARD_W = 1080
export const CARD_H = 1920

const DISPLAY = "'Archivo Black', Archivo, sans-serif"
const BODY = "'Archivo Variable', Archivo, sans-serif"

/** Sizes actually drawn, so `document.fonts.load` can be asked for each. */
const DISPLAY_SIZES = [26, 62, 92, 96, 104, 132, 150, 172, 208, 330]
const BODY_SIZES = [26, 30, 32, 34, 36, 38, 40, 44, 46, 52, 54, 60, 74]

interface Palette {
  readonly bg: string
  readonly bgDeep: string
  readonly fg: string
  readonly onBrand: string
  readonly brand: string
  readonly brandBright: string
  readonly brandNumber: string
  readonly secondary: string
  readonly muted: string
  readonly dim: string
  readonly rule: string
  readonly panel: string
  /** The same colours with an alpha, for gradient stops. */
  readonly fade: (colour: string, alpha: number) => string
}

/**
 * Every colour, taken from the CSS tokens and turned into plain sRGB bytes.
 *
 * Reading `ctx.fillStyle` back is not enough. A browser serialises a colour in
 * whatever syntax it likes — `#rrggbb` here, `color(srgb …)` there, sometimes
 * the `oklch(…)` it was given — and a gradient stop needs an alpha, which means
 * either splicing a string whose shape is unknown or getting the numbers out.
 *
 * So each token is painted into a one-pixel canvas and read back with
 * `getImageData`. That is the browser's own parser and its own gamut mapping,
 * and what comes out is three bytes that every drawing surface understands. It
 * is a dozen one-pixel fills once per card, which is nothing next to the
 * 1080×1920 the rest of this file paints.
 *
 * A colour it cannot parse leaves the pixel at the sentinel, and the value
 * written down here is used instead.
 */
const SENTINEL = { r: 255, g: 0, b: 255 }

function rgb(r: number, g: number, b: number): string {
  return `rgb(${String(r)} ${String(g)} ${String(b)})`
}

function resolver(): (name: string, fallback: string) => string {
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const ctx = probe.getContext('2d', { willReadFrequently: true })
  const style = getComputedStyle(document.documentElement)

  return (name, fallback) => {
    const value = style.getPropertyValue(name).trim()
    if (ctx === null || value === '') return fallback

    ctx.fillStyle = rgb(SENTINEL.r, SENTINEL.g, SENTINEL.b)
    ctx.fillRect(0, 0, 1, 1)
    ctx.fillStyle = value
    ctx.fillRect(0, 0, 1, 1)

    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    if (r === undefined || g === undefined || b === undefined) return fallback
    if (r === SENTINEL.r && g === SENTINEL.g && b === SENTINEL.b) return fallback
    return rgb(r, g, b)
  }
}

/** `rgb(r g b)` → `rgb(r g b / a)`, which is the only shape this file makes. */
function fade(colour: string, alpha: number): string {
  const match = /^rgb\((\d+) (\d+) (\d+)\)$/.exec(colour)
  if (match === null) return colour
  return `rgb(${match[1] ?? '0'} ${match[2] ?? '0'} ${match[3] ?? '0'} / ${String(alpha)})`
}

function palette(): Palette {
  const read = resolver()
  return {
    bg: read('--ds-bg-app', 'rgb(35 26 24)'),
    bgDeep: read('--ds-bg-root', 'rgb(25 18 17)'),
    fg: read('--ds-text-primary', 'rgb(247 242 239)'),
    onBrand: read('--ds-text-on-brand', 'rgb(255 250 247)'),
    brand: read('--ds-brand', 'rgb(226 60 52)'),
    brandBright: read('--ds-brand-label-hi', 'rgb(255 176 166)'),
    brandNumber: read('--ds-brand-accent-hi', 'rgb(255 125 111)'),
    secondary: read('--ds-text-secondary', 'rgb(228 220 216)'),
    muted: read('--ds-text-muted', 'rgb(171 159 153)'),
    dim: read('--ds-text-dim', 'rgb(148 136 129)'),
    rule: read('--ds-surface-7', 'rgb(75 63 60)'),
    panel: read('--ds-bg-bar-solid', 'rgb(31 23 22)'),
    fade,
  }
}

// ── what a card is ──────────────────────────────────────────────────────────

/** A photograph already loaded, or nothing — every card has a version without. */
export type CardImage = ImageBitmap | HTMLImageElement | null

export interface CheckinCard {
  readonly kind: 'checkin'
  readonly photo: CardImage
  /** "Divendres 12 de setembre · 23:41" */
  readonly when: string
  /** "Ja sóc dins" */
  readonly headline: string
  /** "Benvinguda 25/26 · Nau 3" */
  readonly what: string
  /** "28 de 30 ja hi som", or null when the event has no cap. */
  readonly count: string | null
}

export interface RankingCard {
  readonly kind: 'ranking'
  readonly photo: CardImage
  readonly eyebrow: string
  /** "+7" */
  readonly delta: string
  /** "posicions" / "en una setmana" */
  readonly deltaLabel: string
  readonly deltaSub: string
  readonly from: string
  readonly to: string
  readonly outOf: string
  readonly points: string
  readonly pointsLabel: string
  readonly extra: string | null
  readonly extraLabel: string | null
}

export interface RecapCard {
  readonly kind: 'recap'
  readonly photo: CardImage
  readonly eyebrow: string
  readonly headline: string
  readonly stats: readonly { readonly value: string; readonly label: string }[]
  readonly footnote: string | null
}

export interface DiptychCard {
  readonly kind: 'diptych'
  readonly entry: CardImage
  readonly exit: CardImage
  readonly entryLabel: string
  readonly entryTime: string
  readonly exitLabel: string
  readonly exitTime: string
  readonly title: string
  readonly subtitle: string
  readonly badge: string | null
}

export type Card = CheckinCard | RankingCard | RecapCard | DiptychCard

/**
 * A photograph, loaded so a canvas can be read back afterwards.
 *
 * Fetched to a blob and turned into an `ImageBitmap` rather than assigned to an
 * `<img>`. A signed storage URL is another origin, and drawing a cross-origin
 * image onto a canvas taints it: `toBlob` then throws SecurityError and there
 * is no card at all. A bitmap decoded from a blob this page already holds
 * carries no such flag. `crossOrigin = "anonymous"` would also work and would
 * put the fix a whole request away from the failure.
 *
 * Null on anything going wrong, because every card has a version with no
 * photograph and that is a better outcome than an error.
 */
export async function loadCardImage(url: string | null | undefined): Promise<CardImage> {
  if (url === null || url === undefined || url === '') return null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return await createImageBitmap(await response.blob())
  } catch {
    return null
  }
}

// ── drawing ─────────────────────────────────────────────────────────────────

/**
 * The card as a PNG.
 *
 * PNG and not JPEG: these are flat colour and big type, which JPEG rings
 * around, and the share sheet does not care about the extra megabyte.
 */
export async function drawCard(card: Card): Promise<Blob> {
  await loadFonts()

  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('no_canvas')

  const p = palette()
  ctx.fillStyle = card.kind === 'diptych' ? p.bgDeep : p.bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.textBaseline = 'alphabetic'

  if (card.kind === 'checkin') drawCheckin(ctx, p, card)
  else if (card.kind === 'ranking') drawRanking(ctx, p, card)
  else if (card.kind === 'recap') drawRecap(ctx, p, card)
  else drawDiptych(ctx, p, card)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })
  if (blob === null) throw new Error('no_blob')
  return blob
}

async function loadFonts(): Promise<void> {
  if (typeof document.fonts === 'undefined') return
  const wanted = [
    ...DISPLAY_SIZES.map((s) => `400 ${String(s)}px ${DISPLAY}`),
    ...BODY_SIZES.flatMap((s) => [`700 ${String(s)}px ${BODY}`, `800 ${String(s)}px ${BODY}`]),
  ]
  // Never rejects: a face that will not load is a card in the fallback, which
  // is worse than the right face and far better than no card at all.
  await Promise.all(wanted.map((f) => document.fonts.load(f).catch(() => undefined)))
}

// ── the pieces every card shares ────────────────────────────────────────────

/** The photograph, covering a box, cropped from the middle like object-fit. */
function cover(
  ctx: CanvasRenderingContext2D,
  image: CardImage,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (image === null) return
  const iw = 'width' in image ? image.width : 0
  const ih = 'height' in image ? image.height : 0
  if (iw === 0 || ih === 0) return

  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

/** A vertical wash, so type stays readable over any photograph. */
function scrim(
  ctx: CanvasRenderingContext2D,
  y: number,
  h: number,
  stops: readonly [number, string][],
): void {
  const gradient = ctx.createLinearGradient(0, y, 0, y + h)
  for (const [at, colour] of stops) gradient.addColorStop(at, colour)
  ctx.fillStyle = gradient
  ctx.fillRect(0, y, CARD_W, h)
}

/**
 * The logo, redrawn.
 *
 * There is no image file anywhere in this repo — the mark is a `<span>` with a
 * background — so it is rebuilt here from the same ratios `ui/Logo` uses, off
 * the same configured short name. The full stop is a disc and not a glyph,
 * which is the one piece of the mark with meaning.
 */
function logo(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, size: number): void {
  const radius = size * 0.225
  ctx.fillStyle = p.brand
  ctx.beginPath()
  ctx.roundRect(x, y, size, size, radius)
  ctx.fill()

  const name = brand.shortName.trim()
  const hasDot = name.endsWith('.')
  const word = hasDot ? name.slice(0, -1) : name
  const fontSize = size * 0.284
  const dot = size * 0.081
  const gap = size * 0.0275

  ctx.font = `400 ${String(fontSize)}px ${DISPLAY}`
  ctx.fillStyle = p.onBrand
  const wordWidth = ctx.measureText(word).width
  const total = wordWidth + (hasDot ? gap + dot : 0)
  const left = x + (size - total) / 2
  // Optically centred on the mark rather than on the text box: Archivo Black
  // has deep descenders this word never uses.
  const baseline = y + size / 2 + fontSize * 0.36

  ctx.textAlign = 'left'
  ctx.fillText(word, left, baseline)
  if (hasDot) {
    ctx.beginPath()
    ctx.arc(left + wordWidth + gap + dot / 2, baseline - dot / 2, dot / 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** The mark plus the association's own name, bottom left on every card. */
function signature(ctx: CanvasRenderingContext2D, p: Palette, y: number): void {
  logo(ctx, p, 80, y, 96)

  // Shrunk to fit rather than truncated: the association's own name is the one
  // string on the card that must not end in an ellipsis.
  const room = CARD_W - 202 - 80
  ctx.textAlign = 'left'
  ctx.fillStyle = p.fg
  ctx.font = `800 ${String(fitOne(ctx, brand.name, room, (s) => `800 ${String(s)}px ${BODY}`, 38, 22))}px ${BODY}`
  ctx.fillText(brand.name, 202, y + 42)
  ctx.fillStyle = p.secondary
  ctx.font = `600 ${String(fitOne(ctx, brand.tagline, room, (s) => `600 ${String(s)}px ${BODY}`, 32, 20))}px ${BODY}`
  ctx.fillText(brand.tagline, 202, y + 88)
}

/** The 120×12 brand rule the drawings open every card with. */
function tick(ctx: CanvasRenderingContext2D, p: Palette, y: number): void {
  ctx.fillStyle = p.brand
  ctx.fillRect(80, y, 120, 12)
}

/** An eyebrow: small, wide-tracked, upper case. Canvas has no letter-spacing. */
function tracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  em: number,
  maxWidth = CARD_W - 160,
): void {
  const glyphs = [...text.toUpperCase()]

  // The size comes from the px in the shorthand and not from
  // `parseFloat(ctx.font)`, which reads the weight: `800 34px …` gives 800, and
  // every eyebrow came out with 160 pixels between its letters.
  const sizeOf = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16)
  const widthAt = (size: number) =>
    glyphs.reduce((sum, g) => sum + ctx.measureText(g).width, 0) + size * em * (glyphs.length - 1)

  // Tracked type is much wider than the string it came from, and a date in
  // Catalan is longer than a date in the drawing. Shrink until it fits rather
  // than run off the card.
  let size = sizeOf(ctx.font)
  while (size > 18 && widthAt(size) > maxWidth) {
    size = Math.max(18, Math.round(size * 0.94))
    ctx.font = ctx.font.replace(/(\d+(?:\.\d+)?)px/, `${String(size)}px`)
  }

  const spacing = size * em
  let cursor = x
  for (const glyph of glyphs) {
    ctx.fillText(glyph, cursor, y)
    cursor += ctx.measureText(glyph).width + spacing
  }
}

/**
 * Type that fits, which the drawings never had to worry about.
 *
 * "Benvinguda 25/26" at 172px fits. "Festa Major de Primavera del TecnoCampus"
 * does not, and neither does the association's own full name at 38px — and a
 * canvas does not wrap, clip or complain: it draws straight off the edge, which
 * on a story is a title with its last letters missing.
 *
 * So the size comes down until the longest line fits and there are not too many
 * of them. Steps of 6% rather than a binary search: a dozen `measureText` calls
 * on a string is nothing, and the loop is easier to be sure about.
 */
function fitLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: (size: number) => string,
  from: number,
  to: number,
  maxLines: number,
): { readonly size: number; readonly lines: readonly string[] } {
  let size = from
  let lines: string[] = []
  while (size > to) {
    ctx.font = font(size)
    lines = wrap(ctx, text, maxWidth)
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width))
    if (lines.length <= maxLines && widest <= maxWidth) break
    size = Math.max(to, Math.round(size * 0.94))
  }
  ctx.font = font(size)
  if (lines.length === 0) lines = wrap(ctx, text, maxWidth)
  return { size, lines }
}

/** One line, shrunk until it fits. For names that have to stay on one line. */
function fitOne(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: (size: number) => string,
  from: number,
  to: number,
): number {
  let size = from
  ctx.font = font(size)
  while (size > to && ctx.measureText(text).width > maxWidth) {
    size = Math.max(to, Math.round(size * 0.94))
    ctx.font = font(size)
  }
  return size
}

/**
 * Wrapped display type, laid out upwards from a baseline.
 *
 * Upwards because every headline in the drawings is anchored to the bottom of
 * its block: a two-line title has to grow into the space above it rather than
 * push the facts underneath it off the card.
 */
function wrapUp(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  bottom: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(/\s+/).filter((w) => w !== '')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line === '' ? word : `${line} ${word}`
    if (ctx.measureText(candidate).width > maxWidth && line !== '') {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line !== '') lines.push(line)

  let y = bottom - (lines.length - 1) * lineHeight
  for (const each of lines) {
    ctx.fillText(each, x, y)
    y += lineHeight
  }
}

/** A filled pill with type in it, measured to its own text. */
function chip(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  text: string,
  x: number,
  y: number,
): void {
  ctx.font = `800 40px ${BODY}`
  const w = ctx.measureText(text).width + 60
  ctx.fillStyle = p.brand
  ctx.fillRect(x, y, w, 84)
  ctx.fillStyle = p.onBrand
  ctx.fillText(text, x + 30, y + 56)
}

// ── the four cards ──────────────────────────────────────────────────────────

function drawCheckin(ctx: CanvasRenderingContext2D, p: Palette, card: CheckinCard): void {
  cover(ctx, card.photo, 0, 0, CARD_W, CARD_H)
  if (card.photo !== null) {
    scrim(ctx, 0, CARD_H, [
      [0, p.fade(p.bgDeep, 0.82)],
      [0.34, p.fade(p.bg, 0.12)],
      [0.74, p.fade(p.bg, 0.82)],
      [1, p.fade(p.bgDeep, 0.97)],
    ])
  }

  tick(ctx, p, 190)
  ctx.textAlign = 'left'
  ctx.fillStyle = p.brandBright
  ctx.font = `800 36px ${BODY}`
  tracked(ctx, card.when, 80, 262, 0.2)

  ctx.fillStyle = p.fg
  const head = fitLines(
    ctx,
    card.headline.toUpperCase(),
    CARD_W - 160,
    (size) => `400 ${String(size)}px ${DISPLAY}`,
    208,
    96,
    3,
  )
  wrapUp(ctx, card.headline.toUpperCase(), 80, CARD_H - 470, CARD_W - 160, head.size * 0.82)

  // fitOne leaves ctx.font at the size it settled on, which is what is wanted
  // here: the return value is only useful when something has to be measured
  // against it.
  ctx.fillStyle = p.secondary
  fitOne(ctx, card.what, CARD_W - 160, (size) => `700 ${String(size)}px ${BODY}`, 60, 34)
  ctx.fillText(card.what, 80, CARD_H - 470 + 104)

  if (card.count !== null) chip(ctx, p, card.count, 80, CARD_H - 470 + 138)

  signature(ctx, p, CARD_H - 306)
}

function drawRanking(ctx: CanvasRenderingContext2D, p: Palette, card: RankingCard): void {
  cover(ctx, card.photo, 0, 0, CARD_W, 640)
  if (card.photo !== null) {
    scrim(ctx, 0, 640, [
      [0, p.fade(p.bg, 0.5)],
      [0.4, p.fade(p.bg, 0.2)],
      [1, p.bg],
    ])
  }

  tick(ctx, p, 150)
  ctx.textAlign = 'left'
  ctx.fillStyle = p.brandBright
  ctx.font = `800 36px ${BODY}`
  tracked(ctx, card.eyebrow, 80, 222, 0.2)

  // With no photograph the top 640 pixels are an empty rectangle, so the whole
  // block moves up into them. The drawings have a version of every card
  // without a picture, and this is what that means here.
  const top = card.photo === null ? 340 : 690

  ctx.fillStyle = p.brandNumber
  ctx.font = `400 330px ${DISPLAY}`
  ctx.fillText(card.delta, 80, top + 250)
  const deltaWidth = ctx.measureText(card.delta).width

  ctx.fillStyle = p.muted
  ctx.font = `800 46px ${BODY}`
  tracked(ctx, card.deltaLabel, 120 + deltaWidth, top + 78, 0.14, CARD_W - 200 - deltaWidth)
  ctx.fillStyle = p.fg
  fitOne(
    ctx,
    card.deltaSub,
    CARD_W - 200 - deltaWidth,
    (size) => `700 ${String(size)}px ${BODY}`,
    54,
    32,
  )
  ctx.fillText(card.deltaSub, 120 + deltaWidth, top + 152)

  // The move itself: struck-through, then an arrow, then where you are now.
  const row = top + 420
  ctx.fillStyle = p.dim
  ctx.font = `400 96px ${DISPLAY}`
  ctx.fillText(card.from, 80, row)
  const fromWidth = ctx.measureText(card.from).width
  // Through the middle of the numerals, which for Archivo Black is about a
  // third of the size above the baseline. A fixed 30 put it through their tops.
  ctx.fillRect(80, row - 96 * 0.33, fromWidth, 6)

  let x = 80 + fromWidth + 30
  ctx.font = `800 74px ${BODY}`
  ctx.fillText('→', x, row)
  x += ctx.measureText('→').width + 30

  ctx.fillStyle = p.fg
  ctx.font = `400 150px ${DISPLAY}`
  ctx.fillText(card.to, x, row)
  x += ctx.measureText(card.to).width + 30

  ctx.fillStyle = p.muted
  ctx.font = `700 44px ${BODY}`
  ctx.fillText(card.outOf, x, row)

  // Two panels, hairline apart, the right one filled when there is a second
  // fact worth filling it for.
  const panelY = CARD_H - 430 - 200
  const both = card.extra !== null && card.extraLabel !== null
  const width = both ? (CARD_W - 160 - 2) / 2 : CARD_W - 160
  ctx.fillStyle = p.rule
  ctx.fillRect(80, panelY, CARD_W - 160, 200)
  panel(ctx, p, 80, panelY, width, 200, card.points, card.pointsLabel, false)
  // One fact takes the whole strip rather than leaving a blank half. The
  // drawing has two because it had a second fact; an empty box next to a full
  // one reads as something that failed to load.
  if (both && card.extra !== null && card.extraLabel !== null) {
    panel(ctx, p, 82 + width, panelY, width, 200, card.extra, card.extraLabel, true)
  }

  signature(ctx, p, CARD_H - 306)
}

function drawRecap(ctx: CanvasRenderingContext2D, p: Palette, card: RecapCard): void {
  cover(ctx, card.photo, 0, 0, CARD_W, CARD_H)
  if (card.photo !== null) {
    scrim(ctx, 0, CARD_H, [
      [0, p.fade(p.bgDeep, 0.86)],
      [0.3, p.fade(p.bg, 0.2)],
      [0.66, p.fade(p.bg, 0.88)],
      [1, p.bgDeep],
    ])
  }

  tick(ctx, p, 190)
  ctx.textAlign = 'left'
  ctx.fillStyle = p.brandBright
  ctx.font = `800 36px ${BODY}`
  tracked(ctx, card.eyebrow, 80, 262, 0.2)

  ctx.fillStyle = p.fg
  const head = fitLines(
    ctx,
    card.headline.toUpperCase(),
    CARD_W - 160,
    (size) => `400 ${String(size)}px ${DISPLAY}`,
    172,
    80,
    3,
  )
  let y = 302 + head.size * 0.82
  for (const line of head.lines) {
    ctx.fillText(line, 80, y)
    y += head.size * 0.82
  }

  // The stat strip: equal columns, hairline apart, the last one filled.
  const stats = card.stats.slice(0, 3)
  if (stats.length > 0) {
    const stripY = CARD_H - 430 - 240
    const gap = 2
    const width = (CARD_W - 160 - gap * (stats.length - 1)) / stats.length
    ctx.fillStyle = p.rule
    ctx.fillRect(80, stripY, CARD_W - 160, 240)
    stats.forEach((stat, index) => {
      panel(
        ctx,
        p,
        80 + index * (width + gap),
        stripY,
        width,
        240,
        stat.value,
        stat.label,
        index === stats.length - 1,
      )
    })

    if (card.footnote !== null) {
      ctx.fillStyle = p.secondary
      const note = fitLines(
        ctx,
        card.footnote,
        CARD_W - 160,
        (size) => `700 ${String(size)}px ${BODY}`,
        52,
        34,
        3,
      )
      let noteY = stripY + 240 + note.size + 26
      for (const line of note.lines) {
        ctx.fillText(line, 80, noteY)
        noteY += note.size * 1.27
      }
    }
  }

  signature(ctx, p, CARD_H - 306)
}

function drawDiptych(ctx: CanvasRenderingContext2D, p: Palette, card: DiptychCard): void {
  const half = 806
  drawHalf(ctx, p, card.entry, 0, half, card.entryLabel, card.entryTime, 150)
  ctx.fillStyle = p.brand
  ctx.fillRect(0, half, CARD_W, 8)
  drawHalf(ctx, p, card.exit, half + 8, half, card.exitLabel, card.exitTime, 130)

  // The foot: the mark and the night on the left, how long it lasted on the
  // right, over a solid band so neither ever lands on a photograph.
  const footY = CARD_H - 300
  ctx.fillStyle = p.bgDeep
  ctx.fillRect(0, footY, CARD_W, 300)

  logo(ctx, p, 80, footY + 102, 96)
  // The badge on the right takes its own room, so the title has less than the
  // full width to live in.
  const room = CARD_W - 202 - 80 - (card.badge === null ? 0 : 280)
  ctx.textAlign = 'left'
  ctx.fillStyle = p.fg
  ctx.font = `800 ${String(fitOne(ctx, card.title, room, (s) => `800 ${String(s)}px ${BODY}`, 38, 22))}px ${BODY}`
  ctx.fillText(card.title, 202, footY + 144)
  ctx.fillStyle = p.secondary
  ctx.font = `600 ${String(fitOne(ctx, card.subtitle, room, (s) => `600 ${String(s)}px ${BODY}`, 32, 20))}px ${BODY}`
  ctx.fillText(card.subtitle, 202, footY + 190)

  if (card.badge !== null) {
    ctx.textAlign = 'right'
    ctx.fillStyle = p.brandNumber
    ctx.font = `400 62px ${DISPLAY}`
    ctx.fillText(card.badge, CARD_W - 80, footY + 172)
    ctx.textAlign = 'left'
  }
}

function drawHalf(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  image: CardImage,
  y: number,
  h: number,
  label: string,
  time: string,
  labelTop: number,
): void {
  cover(ctx, image, 0, y, CARD_W, h)
  if (image === null) {
    // No photograph, no pretending: the panel is flat and the time carries the
    // half on its own. The drawings have this case for the entry half, and it
    // is the common one — the door camera is off by default.
    ctx.fillStyle = p.bg
    ctx.fillRect(0, y, CARD_W, h)
  } else {
    scrim(ctx, y, h, [
      [0, p.fade(p.bgDeep, 0.72)],
      [0.4, p.fade(p.bg, 0.05)],
      [1, p.fade(p.bgDeep, 0.5)],
    ])
  }

  ctx.textAlign = 'left'
  ctx.fillStyle = p.brandBright
  ctx.font = `800 34px ${BODY}`
  tracked(ctx, label, 60, y + labelTop, 0.2)

  ctx.fillStyle = p.fg
  ctx.font = `400 132px ${DISPLAY}`
  ctx.fillText(time, 60, y + labelTop + 130)
}

/** One cell of a stat strip: a display number over a tracked label. */
function panel(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  x: number,
  y: number,
  w: number,
  h: number,
  value: string,
  label: string,
  filled: boolean,
): void {
  // A shade under the card, not the card itself: the drawings sit these on
  // 0.14 against a 0.15 ground, and a panel the same colour as what is
  // behind it is not a panel, it is loose text.
  ctx.fillStyle = filled ? p.brand : p.panel
  ctx.fillRect(x, y, w, h)

  const size = h >= 240 ? 104 : 92
  ctx.textAlign = 'left'
  ctx.fillStyle = filled ? p.onBrand : p.fg
  ctx.font = `400 ${String(size)}px ${DISPLAY}`
  ctx.fillText(value, x + 34, y + 40 + size * 0.78)

  ctx.fillStyle = filled ? p.onBrand : p.muted
  ctx.font = `800 ${String(h >= 240 ? 26 : 30)}px ${BODY}`
  tracked(ctx, label, x + 34, y + h - 46, 0.12, w - 68)
}

/** Wrapped lines, top-down. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter((w) => w !== '')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line === '' ? word : `${line} ${word}`
    if (ctx.measureText(candidate).width > maxWidth && line !== '') {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line !== '') lines.push(line)
  return lines
}

