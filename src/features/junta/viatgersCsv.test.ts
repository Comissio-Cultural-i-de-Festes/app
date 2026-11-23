import { describe, expect, it } from 'vitest'

import { type DadesViatger, cella, csvViatgers } from './viatgersCsv'

const FILA: DadesViatger = {
  nom: 'Núria',
  cognom1: 'Inventada',
  cognom2: null,
  sexe: 'dona',
  tipus_document: 'nie',
  numero_document: 'X1234567L',
  numero_suport: 'E12345678',
  nacionalitat: 'FR',
  data_naixement: '2003-04-05',
  adreca: 'Carrer Inventat, 1; 2n',
  localitat: "L'Hospitalet de Prova",
  pais: 'ES',
  telefon_emergencia: '+33955000003',
}

describe('una cel·la', () => {
  it('desarma el que l’Excel executaria com a fórmula', () => {
    expect(cella('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(cella('+33955000003')).toBe("'+33955000003")
    expect(cella('-1')).toBe("'-1")
    expect(cella('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(cella('\tX')).toBe("'\tX")
  })

  it('posa entre cometes el que trencaria la fila', () => {
    expect(cella('a;b')).toBe('"a;b"')
    expect(cella('dir "hola"')).toBe('"dir ""hola"""')
    expect(cella('Carrer Inventat 1')).toBe('Carrer Inventat 1')
  })
})

describe('el tipus de document', () => {
  it('el de la UE surt amb el seu nom, igual que els altres', () => {
    const fila = { ...FILA, tipus_document: 'id_ue' as const, numero_suport: null }
    expect(csvViatgers([fila]).split(';')).toContain("Document d'identitat de la UE")
  })
})

describe('el fitxer', () => {
  const csv = csvViatgers([FILA])
  const linies = csv.slice(1).split('\r\n')

  it('comença amb el BOM i acaba les files amb CRLF', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.slice(1).includes('\n\n')).toBe(false)
  })

  it("té les tretze capçaleres en català i en l'ordre de l'issue", () => {
    expect(linies[0]?.split(';')).toEqual([
      'Nom',
      'Primer cognom',
      'Segon cognom',
      'Sexe',
      'Tipus de document',
      'Número de document',
      'Número de suport',
      'Nacionalitat',
      'Data de naixement',
      'Adreça',
      'Localitat',
      'País',
      "Telèfon d'emergència",
    ])
  })

  it('i una fila per persona, amb els valors llegibles', () => {
    expect(linies[1]).toBe(
      [
        'Núria',
        'Inventada',
        '',
        'Dona',
        'NIE',
        'X1234567L',
        'E12345678',
        'França',
        '05/04/2003',
        '"Carrer Inventat, 1; 2n"',
        "L'Hospitalet de Prova",
        'Espanya',
        "'+33955000003",
      ].join(';'),
    )
  })

  it('sense ningú, només les capçaleres', () => {
    expect(csvViatgers([]).slice(1).split('\r\n').filter(Boolean)).toHaveLength(1)
  })
})
