import { describe, expect, it } from 'vitest'

import {
  daysUntil,
  formatHores,
  formatOrdinal,
  formatSigned,
  horesParts,
  zonedDayStart,
} from './format'

/**
 * These are the ones with an opinion in them. The rest of format.ts is Intl
 * with the association's time zone pinned, which has nothing to assert that is
 * not really a test of Intl.
 */

describe('ordinals', () => {
  it('uses the four Catalan abbreviations and -è for the rest', () => {
    expect(formatOrdinal(1, 'ca')).toBe('1r')
    expect(formatOrdinal(2, 'ca')).toBe('2n')
    expect(formatOrdinal(3, 'ca')).toBe('3r')
    expect(formatOrdinal(4, 'ca')).toBe('4t')
    expect(formatOrdinal(5, 'ca')).toBe('5è')
    expect(formatOrdinal(12, 'ca')).toBe('12è')
    expect(formatOrdinal(21, 'ca')).toBe('21è')
  })

  it('makes the Catalan feminine -a throughout', () => {
    // "La Politècnica va 2a". The masculine 2n here would be the kind of
    // mistake that makes an app read as translated rather than written.
    expect(formatOrdinal(1, 'ca', 'f')).toBe('1a')
    expect(formatOrdinal(2, 'ca', 'f')).toBe('2a')
    expect(formatOrdinal(5, 'ca', 'f')).toBe('5a')
  })

  it('marks gender in Spanish too', () => {
    expect(formatOrdinal(2, 'es')).toBe('2.º')
    expect(formatOrdinal(2, 'es', 'f')).toBe('2.ª')
  })

  it('gets the English teens right, which is where every naive version breaks', () => {
    expect(formatOrdinal(1, 'en')).toBe('1st')
    expect(formatOrdinal(2, 'en')).toBe('2nd')
    expect(formatOrdinal(3, 'en')).toBe('3rd')
    expect(formatOrdinal(4, 'en')).toBe('4th')
    expect(formatOrdinal(11, 'en')).toBe('11th')
    expect(formatOrdinal(12, 'en')).toBe('12th')
    expect(formatOrdinal(13, 'en')).toBe('13th')
    expect(formatOrdinal(21, 'en')).toBe('21st')
    expect(formatOrdinal(112, 'en')).toBe('112th')
  })
})

describe('how many sleeps away', () => {
  // Europe/Madrid, so a UTC timestamp late in the evening is already the next
  // calendar day locally in summer. This is the whole reason the calculation
  // does not just subtract two timestamps.
  const friday = new Date('2026-09-25T19:00:00Z')

  it('is zero on the day itself, whatever the hour', () => {
    expect(daysUntil(friday, new Date('2026-09-25T05:00:00Z'))).toBe(0)
    expect(daysUntil(friday, new Date('2026-09-25T21:30:00Z'))).toBe(0)
  })

  it('is one the evening before, not zero', () => {
    // 23:30 UTC on the 24th is already 01:30 on the 25th in Madrid, so a naive
    // difference in hours would call an event the following evening "today".
    expect(daysUntil(friday, new Date('2026-09-24T09:00:00Z'))).toBe(1)
  })

  it('counts whole local days, not twenty-four hour blocks', () => {
    expect(daysUntil(friday, new Date('2026-09-20T09:00:00Z'))).toBe(5)
  })

  it('counts from the local day, so late-night UTC has already rolled over', () => {
    // 23:00 UTC on the 20th is 01:00 on the 21st in Madrid, so there are four
    // sleeps to Friday and not five. Someone opening the app at one in the
    // morning is in tomorrow, and the countdown has to agree with them.
    expect(daysUntil(friday, new Date('2026-09-20T23:00:00Z'))).toBe(4)
  })

  it('goes negative once it has happened', () => {
    expect(daysUntil(friday, new Date('2026-09-26T10:00:00Z'))).toBe(-1)
  })

  it('puts a late-night event on the day it started', () => {
    // 00:30 UTC on the 26th is 02:30 on the 26th in Madrid, but the party
    // began on the 25th and that is the day everybody will call it.
    const after = new Date('2026-09-26T00:30:00Z')
    expect(zonedDayStart(after)).toBeGreaterThan(zonedDayStart(friday))
  })
})

describe('durades', () => {
  it('escriu «2 h 30», que és la forma de tota l’app', () => {
    expect(formatHores(150, 'ca')).toBe('2 h 30')
  })

  it('i sense minuts no escriu el zero', () => {
    expect(formatHores(120, 'ca')).toBe('2 h')
    expect(formatHores(60, 'ca')).toBe('1 h')
  })

  // Una columna de durades ha de quedar alineada, i «4 h 5» la trenca.
  it('posa els minuts a dues xifres', () => {
    expect(formatHores(245, 'ca')).toBe('4 h 05')
  })

  it('per sota d’una hora només diu els minuts', () => {
    expect(formatHores(45, 'ca')).toBe('45 min')
    expect(formatHores(1, 'ca')).toBe('1 min')
  })

  // El zero és un valor conegut i es diu. Un guionet voldria dir «no ho sabem»,
  // que a la targeta del perfil és un altre estat i té una altra frase.
  it('i el zero és «0 h» i no un guionet', () => {
    expect(formatHores(0, 'ca')).toBe('0 h')
  })

  it('no torna mai una durada negativa', () => {
    expect(formatHores(-30, 'ca')).toBe('0 h')
  })

  // Les hores passen per Intl com tots els números de l'app: a partir de mil,
  // el separador és el de l'idioma i no el que porti el navegador.
  it('i les hores van per Intl, també quan passen de mil', () => {
    expect(formatHores(60 * 1234, 'ca')).toBe('1.234 h')
    expect(formatHores(60 * 1234, 'en')).toBe('1,234 h')
  })

  // La targeta del perfil pinta el número a un graó del display i la unitat dos
  // graons més avall, i per això li fa falta partida.
  it('i ve partida per a les xifres grans', () => {
    expect(horesParts(795, 'ca')).toEqual({ xifra: '13', unitat: 'h 15' })
    expect(horesParts(45, 'ca')).toEqual({ xifra: '45', unitat: 'min' })
  })
})

describe('números amb signe', () => {
  it('el negatiu porta el seu signe i el positiu també', () => {
    expect(formatSigned(-25, 'ca')).toBe('-25')
    expect(formatSigned(25, 'ca')).toBe('+25')
  })

  // El zero és el d'un avís posat i retirat: hi va ser i no ha costat res. Un
  // «+0» el llegiria com un guany, que és l'error que la llista evita.
  it('i el zero no en porta cap', () => {
    expect(formatSigned(0, 'ca')).toBe('0')
  })

  it('i el separador de milers és el de l’idioma', () => {
    expect(formatSigned(-1234, 'ca')).toBe('-1.234')
    expect(formatSigned(-1234, 'en')).toBe('-1,234')
  })
})
