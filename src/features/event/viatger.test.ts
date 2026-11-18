import { describe, expect, it } from 'vitest'

import {
  BUIT,
  type EsborranyViatger,
  esApuntat,
  esborranyDe,
  esborrenEl,
  llegeixViatger,
  netejaText,
  normalitzaDocument,
  normalitzaTelefon,
  numeroDocumentValid,
} from './viatger'

const AVUI = '2026-11-18'

const BO: EsborranyViatger = {
  ...BUIT,
  nom: 'Persona',
  cognom1: 'Inventada',
  cognom2: 'De Prova',
  sexe: 'dona',
  tipus_document: 'dni',
  numero_document: '12345678Z',
  numero_suport: 'ABC123456',
  nacionalitat: 'ES',
  data_naixement: '2003-04-05',
  adreca: 'Carrer Inventat 1',
  localitat: 'Poble Alfa',
  pais: 'ES',
  telefon_emergencia: '955 00 00 01',
}

function problemes(e: EsborranyViatger): string[] {
  const r = llegeixViatger(e, AVUI)
  return r.ok ? [] : [...r.problemes].sort()
}

describe('normalitzar', () => {
  it('el document, com el porta escrit a la cartera', () => {
    expect(normalitzaDocument('1234-5678 z')).toBe('12345678Z')
    expect(normalitzaDocument('x.123.456.7-l')).toBe('X1234567L')
  })

  it('el telèfon, amb el + del davant i prou', () => {
    expect(normalitzaTelefon(' +34 955-00 00 01 ')).toBe('+34955000001')
    expect(normalitzaTelefon('955 00 00 01')).toBe('955000001')
  })

  it('el text, sense blancs als extrems ni salts de línia', () => {
    expect(netejaText('\u200B  Carrer   Inventat\n1 \u00A0')).toBe('Carrer Inventat 1')
    expect(netejaText('Poble\u0007Alfa')).toBe('PobleAlfa')
  })
})

describe('el document', () => {
  it('la lletra del DNI es comprova', () => {
    expect(numeroDocumentValid('dni', '12345678Z')).toBe(true)
    expect(numeroDocumentValid('dni', '12345678A')).toBe(false)
    expect(numeroDocumentValid('dni', '1234567Z')).toBe(false)
  })

  it('i la del NIE, amb la X, la Y i la Z davant', () => {
    expect(numeroDocumentValid('nie', 'X1234567L')).toBe(true)
    expect(numeroDocumentValid('nie', 'Y1234567X')).toBe(true)
    expect(numeroDocumentValid('nie', 'Z1234567R')).toBe(true)
    expect(numeroDocumentValid('nie', 'X1234567A')).toBe(false)
  })

  it('un passaport és alfanumèric i prou', () => {
    expect(numeroDocumentValid('passaport', 'AB1234567')).toBe(true)
    expect(numeroDocumentValid('passaport', 'A')).toBe(false)
  })
})

describe('llegeixViatger', () => {
  it('un formulari bo és una fila neta', () => {
    const r = llegeixViatger(BO, AVUI)
    expect(r).toEqual({
      ok: true,
      fila: {
        nom: 'Persona',
        cognom1: 'Inventada',
        cognom2: 'De Prova',
        sexe: 'dona',
        tipus_document: 'dni',
        numero_document: '12345678Z',
        numero_suport: 'ABC123456',
        nacionalitat: 'ES',
        data_naixement: '2003-04-05',
        adreca: 'Carrer Inventat 1',
        localitat: 'Poble Alfa',
        pais: 'ES',
        telefon_emergencia: '955000001',
      },
    })
  })

  it('un formulari buit diu tots els camps obligatoris, i no el segon cognom', () => {
    expect(problemes(BUIT)).toEqual(
      [
        'adreca',
        'cognom1',
        'data_naixement',
        'localitat',
        'nacionalitat',
        'nom',
        'pais',
        'sexe',
        'telefon_emergencia',
        'tipus_document',
      ].sort(),
    )
  })

  it('sense segon cognom és null, no la cadena buida', () => {
    const r = llegeixViatger({ ...BO, cognom2: '   ' }, AVUI)
    expect(r.ok && r.fila.cognom2).toBeNull()
  })

  it('el DNI i el NIE demanen el número de suport; el passaport el descarta', () => {
    expect(problemes({ ...BO, numero_suport: '' })).toEqual(['numero_suport'])
    const r = llegeixViatger(
      { ...BO, tipus_document: 'passaport', numero_document: 'ab 123 4567' },
      AVUI,
    )
    expect(r.ok && [r.fila.numero_document, r.fila.numero_suport]).toEqual(['AB1234567', null])
  })

  it('una lletra que no quadra es diu, no es corregeix', () => {
    expect(problemes({ ...BO, numero_document: '12345678A' })).toEqual(['numero_document'])
  })

  it("la data de naixement no pot ser futura ni d'abans del 1900", () => {
    expect(problemes({ ...BO, data_naixement: '2026-11-19' })).toEqual(['data_naixement'])
    expect(problemes({ ...BO, data_naixement: '1899-12-31' })).toEqual(['data_naixement'])
    expect(problemes({ ...BO, data_naixement: AVUI })).toEqual([])
  })

  it('un telèfon massa curt no és un telèfon', () => {
    expect(problemes({ ...BO, telefon_emergencia: '955 00' })).toEqual(['telefon_emergencia'])
  })

  it('els màxims de la base', () => {
    expect(problemes({ ...BO, adreca: 'a'.repeat(161) })).toEqual(['adreca'])
    expect(problemes({ ...BO, nom: 'a'.repeat(81) })).toEqual(['nom'])
  })

  it('una fila desada torna al formulari i en surt igual', () => {
    const r = llegeixViatger(BO, AVUI)
    if (!r.ok) throw new Error('el formulari bo no és bo')
    const tornada = llegeixViatger(esborranyDe({ ...r.fila, cognom2: null }), AVUI)
    expect(tornada.ok && tornada.fila).toEqual({ ...r.fila, cognom2: null })
  })
})

describe('qui hi va i fins quan', () => {
  it('apuntat és sí, en espera, demanat o ja dins', () => {
    expect(['si', 'espera', 'sollicitat', 'asistio'].every((e) => esApuntat(e as never))).toBe(true)
    expect(['potser', 'no', 'rebutjat', 'cancelado'].some((e) => esApuntat(e as never))).toBe(false)
    expect(esApuntat(null)).toBe(false)
  })

  it("s'esborren set dies després del final, no de l'inici", () => {
    expect(esborrenEl('2026-11-27T17:00:00Z', '2026-11-29T15:00:00Z').toISOString()).toBe(
      '2026-12-06T15:00:00.000Z',
    )
  })

  it('i sense final, amb les sis hores de sempre', () => {
    expect(esborrenEl('2026-11-27T17:00:00Z', null).toISOString()).toBe('2026-12-04T23:00:00.000Z')
  })
})
