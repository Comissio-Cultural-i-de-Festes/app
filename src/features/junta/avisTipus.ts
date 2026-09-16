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
  const net = traduit.trim()
  // I LA CLAU I18N CRUA COMPTA COM A «NO HI HA TRADUCCIÓ». No és paranoia: el
  // cridador ha de passar '' quan no n'hi ha, però aquesta app arrenca amb
  // `returnEmptyString: false` i llavors `t()` torna la clau sencera en comptes
  // de la cadena buida. Va passar: un tipus afegit per la junta sortia a la
  // pantalla com «avisos.tipus.se_en_va_aviat». El cridador ho decideix bé amb
  // `i18n.exists`, i això és la xarxa de sota, perquè el mode de fallada és una
  // cadena lletja a la cara d'un soci i no un error que es vegi.
  if (net !== '' && net !== `avisos.tipus.${row.clau}`) return net
  const etiqueta = row.etiqueta?.trim() ?? ''
  if (etiqueta !== '') return etiqueta
  return row.clau
}
