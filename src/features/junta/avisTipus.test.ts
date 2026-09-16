import { describe, expect, it } from 'vitest'

import { nomDelTipus } from './avisTipus'
import type { AvisTipus } from './avisosApi'

const tipus = (over: Partial<AvisTipus> = {}): AvisTipus => ({
  clau: 'no_va_venir',
  gravetat: 1,
  punts_suggerits: -10,
  etiqueta: null,
  actiu: true,
  ordre: 1,
  ...over,
})

describe('el nom d’un tipus d’avís', () => {
  it('fa servir la traducció quan n’hi ha', () => {
    expect(nomDelTipus(tipus({ etiqueta: 'Una altra cosa' }), 'No va venir')).toBe('No va venir')
  })

  it('cau a l’etiqueta quan la clau no té traducció', () => {
    // El cas real: la junta afegeix un tipus des de /junta/barem i cap fitxer
    // de locales no el coneixerà mai.
    expect(nomDelTipus(tipus({ clau: 'se_en_va_aviat', etiqueta: "Se'n va abans d'hora" }), '')).toBe(
      "Se'n va abans d'hora",
    )
  })

  it('i a la clau crua quan tampoc no hi ha etiqueta', () => {
    expect(nomDelTipus(tipus({ clau: 'se_en_va_aviat' }), '')).toBe('se_en_va_aviat')
  })

  it('tracta una etiqueta en blanc com si no n’hi hagués', () => {
    // `admin_set_avis_tipus` ja desa null quan arriba en blanc, però la fila
    // pot venir d'abans; una etiqueta d'espais no és un nom.
    expect(nomDelTipus(tipus({ clau: 'se_en_va_aviat', etiqueta: '   ' }), '')).toBe('se_en_va_aviat')
  })

  it('i una traducció en blanc no guanya a l’etiqueta', () => {
    // `t(clau, { defaultValue: '' })` torna '' quan la clau no existeix, que és
    // exactament el que el bloc hi passa.
    expect(nomDelTipus(tipus({ etiqueta: 'Etiqueta' }), '  ')).toBe('Etiqueta')
  })
})
