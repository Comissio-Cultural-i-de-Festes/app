import { describe, expect, it } from 'vitest'

import { DEFAULT_DURATION_MS, buildIcs, icsFilename } from './ics'

const NOW = new Date('2026-11-10T08:30:00.000Z')
const ORIGIN = 'https://comi.example'

const festa = {
  id: '00000000-0000-4000-8000-0000000000e1',
  titol: 'Sopar de tardor',
  startsAt: '2026-11-14T21:00:00.000Z',
  endsAt: '2026-11-15T02:00:00.000Z',
  ubicacio: 'Nau 3, Polígon del Rengle',
  descripcio: 'Porta el got.',
}

const lines = (ics: string) => ics.split('\r\n')
const line = (ics: string, prefix: string) => lines(ics).find((l) => l.startsWith(prefix)) ?? null

describe('el fitxer del calendari', () => {
  it("porta l'hora en UTC i sense cap VTIMEZONE", () => {
    // Un `VTIMEZONE` és la meitat d'un ICS ben fet i la font de la meitat dels
    // seus errors. Amb la Z no fa falta: la base ja guarda un instant absolut.
    const ics = buildIcs([festa], ORIGIN, NOW)
    expect(line(ics, 'DTSTART:')).toBe('DTSTART:20261114T210000Z')
    expect(line(ics, 'DTEND:')).toBe('DTEND:20261115T020000Z')
    expect(ics).not.toContain('VTIMEZONE')
  })

  it('i un UID estable, que és el que fa que tornar-hi sigui inofensiu', () => {
    // El mateix UID vol dir que el calendari ACTUALITZA l'entrada en comptes
    // de crear-ne una segona. És el que arregla el cas de debò: la junta canvia
    // l'hora i la gent hi torna.
    const primer = buildIcs([festa], ORIGIN, NOW)
    const segon = buildIcs(
      [{ ...festa, startsAt: '2026-11-14T22:00:00.000Z' }],
      ORIGIN,
      new Date(NOW.getTime() + 86_400_000),
    )
    expect(line(primer, 'UID:')).toBe(`UID:${festa.id}@comi`)
    expect(line(segon, 'UID:')).toBe(line(primer, 'UID:'))
    expect(line(segon, 'DTSTART:')).not.toBe(line(primer, 'DTSTART:'))
  })

  it('amb una seqüència que puja, o el calendari té dret a ignorar el canvi', () => {
    const primer = buildIcs([festa], ORIGIN, NOW)
    const segon = buildIcs([festa], ORIGIN, new Date(NOW.getTime() + 600_000))
    const seq = (ics: string) => Number(line(ics, 'SEQUENCE:')!.split(':')[1])
    expect(seq(segon)).toBeGreaterThan(seq(primer))
  })

  it('inventa una durada quan no hi ha hora de final', () => {
    // `ends_at` és nul·lable a posta. Sis hores és el mateix supòsit que fa
    // `private.checkin_open_at()`, i una entrada sense final el calendari la
    // pinta com un bloc d'un minut.
    const ics = buildIcs([{ ...festa, endsAt: null }], ORIGIN, NOW)
    const start = new Date(festa.startsAt).getTime()
    const expected = new Date(start + DEFAULT_DURATION_MS)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '')
    expect(line(ics, 'DTEND:')).toBe(`DTEND:${expected}`)
  })

  it('escapa les comes del lloc, i no dues vegades', () => {
    // «Nau 3, Polígon» s'ha d'escapar; i la barra invertida s'escapa PRIMER,
    // perquè fer-ho al final tornaria a escapar les que acabem d'introduir.
    const ics = buildIcs([festa], ORIGIN, NOW)
    expect(line(ics, 'LOCATION:')).toBe('LOCATION:Nau 3\\, Polígon del Rengle')
    expect(ics).not.toContain('\\\\,')
  })

  it('escapa la barra invertida un sol cop', () => {
    const ics = buildIcs([{ ...festa, ubicacio: 'A\\B' }], ORIGIN, NOW)
    expect(line(ics, 'LOCATION:')).toBe('LOCATION:A\\\\B')
  })

  it("i el salt de línia d'una descripció", () => {
    const ics = buildIcs([{ ...festa, descripcio: 'Una\nAltra' }], ORIGIN, NOW)
    expect(line(ics, 'DESCRIPTION:')).toContain('Una\\nAltra')
  })

  it("deixa fora el lloc quan no n'hi ha", () => {
    // Un `LOCATION:` buit el calendari el pinta com una adreça en blanc que es
    // pot tocar. Val més que la línia no hi sigui.
    const ics = buildIcs([{ ...festa, ubicacio: null }], ORIGIN, NOW)
    expect(line(ics, 'LOCATION:')).toBeNull()
    const buit = buildIcs([{ ...festa, ubicacio: '   ' }], ORIGIN, NOW)
    expect(line(buit, 'LOCATION:')).toBeNull()
  })

  it("posa l'enllaç a la descripció i no només al camp URL", () => {
    // Molts calendaris ensenyen el cos i no el camp URL, i tocar l'enllaç és
    // com es torna a l'app.
    const ics = buildIcs([festa], ORIGIN, NOW)
    expect(line(ics, 'URL:')).toBe(`URL:${ORIGIN}/esdeveniment/${festa.id}`)
    expect(ics).toContain(`${ORIGIN}/esdeveniment/${festa.id}`)
  })

  it('acaba amb CRLF i no amb salts de línia sols', () => {
    // L'RFC 5545 ho demana i el calendari d'iOS és el que se'n queixa: un
    // fitxer amb \\n s'obre buit i sense dir per què.
    const ics = buildIcs([festa], ORIGIN, NOW)
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('talla les línies llargues a 75 octets, comptant en octets', () => {
    const ics = buildIcs(
      [{ ...festa, descripcio: 'Això és una descripció molt llarga '.repeat(8) }],
      ORIGIN,
      NOW,
    )
    for (const l of lines(ics)) {
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75)
    }
    // I les continuacions comencen amb un espai, que és com es tornen a ajuntar.
    const wrapped = lines(ics).filter((l) => l.startsWith(' '))
    expect(wrapped.length).toBeGreaterThan(0)
  })

  it('i el tall no parteix un caràcter accentuat pel mig', () => {
    // Un tall entre els dos octets d'una «ó» deixa el fitxer il·legible i el
    // símptoma és un calendari que no obre res.
    const ics = buildIcs([{ ...festa, descripcio: 'ó'.repeat(120) }], ORIGIN, NOW)
    expect(ics).not.toContain('�')
    expect(ics.replace(/\r\n /g, '')).toContain('ó'.repeat(120))
  })

  it('en posa tots en un fitxer quan se li donen tots', () => {
    // «Les meves al calendari»: quatre esdeveniments d'una tirada.
    const ics = buildIcs([festa, { ...festa, id: 'segona', titol: 'Quiz' }], ORIGIN, NOW)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1)
    expect(ics).toContain('UID:segona@comi')
  })

  it('i és PUBLISH, no REQUEST', () => {
    // Amb `REQUEST` Outlook hi posaria botons d'acceptar i declinar que no
    // arribarien enlloc: el sí/potser/no viu a l'app.
    expect(line(buildIcs([festa], ORIGIN, NOW), 'METHOD:')).toBe('METHOD:PUBLISH')
  })
})

describe('el nom del fitxer', () => {
  it('treu els accents i els espais', () => {
    expect(icsFilename('Sopar de tardor')).toBe('sopar-de-tardor.ics')
    expect(icsFilename("Nit de Cap d'Any")).toBe('nit-de-cap-d-any.ics')
  })

  it('i no es queda mai buit', () => {
    // Un `download=""` guarda el fitxer amb el nom de l'origen.
    expect(icsFilename('¿¡!')).toBe('esdeveniment.ics')
    expect(icsFilename('')).toBe('esdeveniment.ics')
  })
})
