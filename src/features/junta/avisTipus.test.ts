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
    expect(
      nomDelTipus(tipus({ clau: 'se_en_va_aviat', etiqueta: "Se'n va abans d'hora" }), ''),
    ).toBe("Se'n va abans d'hora")
  })

  it('i a la clau crua quan tampoc no hi ha etiqueta', () => {
    expect(nomDelTipus(tipus({ clau: 'se_en_va_aviat' }), '')).toBe('se_en_va_aviat')
  })

  it('tracta una etiqueta en blanc com si no n’hi hagués', () => {
    // `admin_set_avis_tipus` ja desa null quan arriba en blanc, però la fila
    // pot venir d'abans; una etiqueta d'espais no és un nom.
    expect(nomDelTipus(tipus({ clau: 'se_en_va_aviat', etiqueta: '   ' }), '')).toBe(
      'se_en_va_aviat',
    )
  })

  it('i una traducció en blanc no guanya a l’etiqueta', () => {
    // COMPTE AMB EL QUE DEIA AQUÍ ABANS. Aquest comentari afirmava que
    // «`t(clau, { defaultValue: '' })` torna '' quan la clau no existeix, que és
    // exactament el que el bloc hi passa», i les dues meitats eren falses.
    //
    // `src/i18n/index.ts` arrenca amb `returnEmptyString: false`, i amb aquella
    // opció i18next DESCARTA la cadena buida i torna LA CLAU. O sigui que el
    // bloc no passava mai '' aquí: passava «avisos.tipus.se_en_va_aviat», que
    // no és buit, i per tant `nomDelTipus` el tornava tal qual i la pantalla
    // ensenyava la clau crua.
    //
    // Aquesta funció sempre ha estat correcta i aquesta prova sempre ha passat:
    // el defecte era la PREMISSA de qui la cridava. És el cas que el CLAUDE.md
    // descriu quan diu que una prova pot passar per sempre mentre la cosa està
    // trencada, i per això es deixa escrit aquí i no només al bloc.
    //
    // Qui truqui aquesta funció ha de decidir si hi ha traducció amb
    // `i18n.exists`, que és el que fa `AvisTipusBlock` des del 2026-09-16.
    expect(nomDelTipus(tipus({ etiqueta: 'Etiqueta' }), '  ')).toBe('Etiqueta')
  })

  it('i si algú li passa la clau i18n crua, tampoc no la pren per un nom', () => {
    // La xarxa de seguretat del defecte de dalt: encara que el cridador torni a
    // equivocar-se i passi la clau sencera, la fila ha de sortir amb l'etiqueta
    // i no amb `avisos.tipus.…`.
    expect(
      nomDelTipus(
        tipus({ clau: 'se_en_va_aviat', etiqueta: "Se'n va abans d'hora" }),
        'avisos.tipus.se_en_va_aviat',
      ),
    ).toBe("Se'n va abans d'hora")
  })
})
