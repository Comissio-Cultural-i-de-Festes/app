import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * The card WhatsApp or Instagram builds from a pasted link.
 *
 * Crawlers run no JavaScript, so what they see is index.html and nothing else,
 * on every URL. That is the property worth guarding: the tags are static and
 * identical for /esdeveniment/<id> and for /, which is why an event that has
 * not been revealed shows nothing of itself in a preview.
 *
 * Nothing about the association is written into the tags; the name and the
 * description come from VITE_* like the rest of the head.
 */

const html = readFileSync('index.html', 'utf8')
const config = readFileSync('vite.config.ts', 'utf8')

function tag(attr: 'property' | 'name', key: string): string | null {
  const match = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`).exec(html)
  return match?.[1] ?? null
}

describe('the link preview tags', () => {
  it.each([
    ['property', 'og:title'],
    ['property', 'og:description'],
    ['property', 'og:image'],
    ['property', 'og:image:width'],
    ['property', 'og:image:height'],
    ['property', 'og:image:alt'],
    ['property', 'og:type'],
    ['property', 'og:site_name'],
    ['name', 'twitter:card'],
    ['name', 'description'],
  ] as const)('has %s %s, and not empty', (attr, key) => {
    expect(tag(attr, key)).toBeTruthy()
  })

  it('asks for the large image card', () => {
    expect(tag('name', 'twitter:card')).toBe('summary_large_image')
  })

  it('takes the name, the description and the site address from the environment', () => {
    expect(tag('property', 'og:title')).toBe('%VITE_APP_NAME%')
    expect(tag('property', 'og:site_name')).toBe('%VITE_APP_SHORT_NAME%')
    expect(tag('property', 'og:description')).toBe('%OG_DESCRIPTION%')
    expect(tag('property', 'og:image')).toBe('%OG_IMAGE_URL%')
  })

  it('has no per-page value: nothing in the preview can name an event', () => {
    const tags = html.match(/<meta\s+(?:property|name)="(?:og|twitter):[^>]*>/g) ?? []
    for (const t of tags) expect(t).not.toMatch(/esdeveniment|event|\$\{/i)
  })

  it('points at an image that is 1200x630', () => {
    const file = readFileSync('public/og-image.png')
    expect(file.subarray(1, 4).toString('latin1')).toBe('PNG')
    expect(file.readUInt32BE(16)).toBe(1200)
    expect(file.readUInt32BE(20)).toBe(630)
    expect(tag('property', 'og:image:width')).toBe('1200')
    expect(tag('property', 'og:image:height')).toBe('630')
  })

  it('keeps the image out of the service worker precache', () => {
    expect(config).toMatch(/globIgnores:\s*\[[^\]]*og-image\.png/)
  })

  it('serves the image with a cache lifetime that is not forever', () => {
    const headers = readFileSync('public/_headers', 'utf8')
    expect(headers).toMatch(/\/og-image\.png\s*\n\s*Cache-Control: public, max-age=\d+\s*\n/)
  })
})
