/**
 * Draws public/og-image.png (1200x630) from the app icon.
 *
 * The preview card that WhatsApp or Instagram builds from a pasted link is a
 * wide crop, and the icons in public/ are the only place the association's
 * brand lives as artwork — nothing about it is written into the repo as text.
 * So the card is derived from `pwa-512x512.png` instead of drawn separately:
 * the field takes the icon's own background colour, the icon is enlarged and
 * cropped to the band the wordmark sits in, and swapping the icons for a fork
 * and re-running this keeps the card on-brand.
 *
 * No image dependency on purpose. The icon is a flat-colour RGB PNG, which a
 * hundred lines of zlib can read and write; sharp would add a native binary to
 * every install for something that runs once per rebrand.
 *
 *   node scripts/make-og-image.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { crc32, inflateSync, deflateSync } from 'node:zlib'

const SOURCE = 'public/pwa-512x512.png'
const TARGET = 'public/og-image.png'
const WIDTH = 1200
const HEIGHT = 630
// Enlarges the icon so the wordmark fills the card. The height of the scaled
// icon exceeds HEIGHT, which is fine: the wordmark sits in the middle band and
// the rest is flat background.
const SCALE = 1.5

function readPng(path) {
  const buf = readFileSync(path)
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  if (buf[24] !== 8 || buf[25] !== 2 || buf[28] !== 0) {
    throw new Error(`${path}: only non-interlaced 8-bit RGB PNGs are supported`)
  }
  const idat = []
  for (let at = 8; at < buf.length;) {
    const length = buf.readUInt32BE(at)
    if (buf.toString('latin1', at + 4, at + 8) === 'IDAT')
      idat.push(buf.subarray(at + 8, at + 8 + length))
    at += length + 12
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 3
  const pixels = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const cur = raw[y * (stride + 1) + 1 + x]
      const left = x >= 3 ? pixels[y * stride + x - 3] : 0
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const upLeft = x >= 3 && y > 0 ? pixels[(y - 1) * stride + x - 3] : 0
      let add = 0
      if (filter === 1) add = left
      else if (filter === 2) add = up
      else if (filter === 3) add = (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        add = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      }
      pixels[y * stride + x] = (cur + add) & 255
    }
  }
  return { width, height, pixels }
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, tail])
}

function writePng(path, width, height, pixels) {
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++)
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

const icon = readPng(SOURCE)
const background = icon.pixels.subarray(0, 3)
const out = Buffer.alloc(WIDTH * HEIGHT * 3)
for (let i = 0; i < out.length; i += 3) background.copy(out, i)

const scaled = Math.round(icon.width * SCALE)
const originX = Math.round((WIDTH - scaled) / 2)
const originY = Math.round((HEIGHT - scaled) / 2)
const sample = (x, y, c) => {
  const cx = Math.min(icon.width - 1, Math.max(0, x))
  const cy = Math.min(icon.height - 1, Math.max(0, y))
  return icon.pixels[(cy * icon.width + cx) * 3 + c]
}
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const sx = (x - originX + 0.5) / SCALE - 0.5
    const sy = (y - originY + 0.5) / SCALE - 0.5
    if (sx < 0 || sy < 0 || sx > icon.width - 1 || sy > icon.height - 1) continue
    const x0 = Math.floor(sx)
    const y0 = Math.floor(sy)
    const fx = sx - x0
    const fy = sy - y0
    for (let c = 0; c < 3; c++) {
      const top = sample(x0, y0, c) * (1 - fx) + sample(x0 + 1, y0, c) * fx
      const bottom = sample(x0, y0 + 1, c) * (1 - fx) + sample(x0 + 1, y0 + 1, c) * fx
      out[(y * WIDTH + x) * 3 + c] = Math.round(top * (1 - fy) + bottom * fy)
    }
  }
}
writePng(TARGET, WIDTH, HEIGHT, out)
console.log(`${TARGET}: ${WIDTH}x${HEIGHT}`)
