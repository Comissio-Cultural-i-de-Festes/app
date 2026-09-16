import type { AvisTipus } from './avisosApi'

/**
 * El nom d'un tipus d'avís, i l'ordre en què es busca.
 *
 * TRES ESGLAONS I NO DOS. Primer la traducció, que és el que tenen els quatre
 * tipus que la migració 73 sembra i que es pinten com `badges.*` i `motive.*`:
 * clau dinàmica cap a `avisos.tipus.<clau>`. Després l'etiqueta que la junta hi
 * hagi posat, que és l'ÚNICA cosa que té un `clau` inventat des de
 * `/junta/barem` —cap fitxer de locales no el coneixerà mai—. I la clau crua
 * només com a últim recurs.
 *
 * Sense el segon esglaó, el dia que la junta afegís un tipus la pantalla
 * ensenyaria `se_en_va_aviat` a qui l'hagi de llegir. És la mateixa solució que
 * `ranking_periods.etiqueta`, i viu aquí i no dins del bloc perquè és una regla
 * i no un dibuix.
 */
export function nomDelTipus(row: AvisTipus, traduit: string): string {
  if (traduit.trim() !== '') return traduit
  const etiqueta = row.etiqueta?.trim() ?? ''
  if (etiqueta !== '') return etiqueta
  return row.clau
}
