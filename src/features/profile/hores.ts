import type { EventType } from '@/lib/model'

/**
 * Les hores del curs, al perfil.
 *
 * Tot el càlcul viu al servidor, dins de `private.minuts_persona`, i aquí no
 * se'n repeteix ni un tros: el total, el que encara és provisional i els minuts
 * de cada activitat arriben fets. El que queda és una decisió de pantalla que
 * val la pena tenir escrita i provada a part, perquè és la que fa que la llista
 * es llegeixi: QUÈ DIU LA SEGONA LÍNIA D'UNA FILA.
 *
 * La regla és que la segona línia només existeix quan hi ha alguna cosa
 * excepcional a dir. La majoria de files són una data, un títol i unes hores, i
 * afegir-hi «activitat» a totes seria una paraula més per fila per a una
 * distinció que ningú no mira.
 */

/** Una activitat del desglossament. El que torna `my_hores()` a `files`. */
export interface HoresFila {
  readonly event_id: string
  /** Null només si l'activitat s'ha quedat sense títol, cosa que la RPC no deixa. */
  readonly titol: string | null
  readonly starts_at: string
  readonly tipo: EventType
  /**
   * Null quan la persona té una marca de sola —va entrar i no es va fer la foto
   * de sortida, o al revés— i per tant ningú no sap quanta estona hi va ser.
   * No és zero: zero voldria dir que no hi va fer res.
   */
  readonly minuts: number | null
  readonly verificat: boolean
}

/** El que torna `my_hores()`. */
export interface Hores {
  /** Quan comença el curs, o null si la junta no té cap període global. */
  readonly des_de: string | null
  readonly fins_a: string | null
  readonly minuts: number
  readonly minuts_provisionals: number
  readonly quantes: number
  readonly files: readonly HoresFila[]
}

/** Les coses excepcionals que una fila pot haver de dir. */
export type HoraNota = 'reunio' | 'sense_sortida' | 'pendent'

/**
 * Què ha de dir la segona línia d'una fila, en ordre de lectura.
 *
 * «Reunió» va primer perquè diu QUÈ va ser allò, i l'estat després perquè diu
 * en quin punt està. Una llista buida vol dir que la fila és d'una sola línia,
 * que és el cas de la majoria.
 *
 * SENSE SORTIDA MENJA PENDENT. Una activitat de la qual no se saben les hores
 * d'algú tampoc no està visada per a ell, o sigui que les dues coses serien
 * certes alhora; però «pendent» vol dir «la junta encara no ho ha mirat» i
 * «sense sortida» vol dir «no ho sap ningú», que és més concret i és el que
 * aquella persona pot fer alguna cosa per resoldre.
 */
export function notesDeLaFila(fila: HoresFila): readonly HoraNota[] {
  const notes: HoraNota[] = []
  if (fila.tipo === 'reunio') notes.push('reunio')
  if (fila.minuts === null) notes.push('sense_sortida')
  else if (!fila.verificat) notes.push('pendent')
  return notes
}
