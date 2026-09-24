import { useQuery } from '@tanstack/react-query'

import { avisosKeys, fetchAvisComptes } from './avisosApi'
import { compta } from './avisosCompte'
import { type EstatAvis, quantsPerEstat } from './estatAvisos'
import { fetchAllMembers, memberKeys } from './membersApi'
import { useNormativa } from './useNormativa'

/**
 * Quanta gent hi ha a cada escaló aquest curs, per al rebedor de `/junta`.
 *
 * UN GANXO I NO UN CÀLCUL DINS DEL BLOC, perquè el número el demanen dos: el
 * bloc que el pinta i el `workCount` del rebedor, que decideix si hi ha feina.
 * Amb el recompte escrit dues vegades, el bloc podria dir «2 a risc» mentre la
 * capçalera diu «res a fer». La consulta és la mateixa i la comparteixen per la
 * cache.
 *
 * NOMÉS ELS ACTIUS. Els avisos d'una persona de baixa continuen existint i la
 * seva fitxa els ensenya, però el rebedor parla de qui és a l'associació: una
 * baixa «a risc» no és feina de ningú, i restar-la dels actius per treure els
 * «ok» donaria un número que no és de ningú. La llista de socis ja és a la cache
 * gairebé sempre, i és la mateixa que pinta els xips.
 *
 * `llest` NO ÉS UN DETALL: abans que arribin els períodes i el barem, tothom
 * sortiria a zero, i «ningú a risc» és una frase que la pantalla no pot dir
 * mentre encara no ho sap.
 */
export function useEstatsAvisos(): {
  readonly perEstat: Readonly<Record<EstatAvis, number>>
  /** Els actius que són en algun escaló per sobre d'`ok`. */
  readonly marcats: number
  readonly llest: boolean
} {
  const members = useQuery({ queryKey: memberKeys.list(), queryFn: fetchAllMembers })
  const { pesos, llindars, des_de, fins_a, llest } = useNormativa()
  const comptes = useQuery({
    queryKey: avisosKeys.comptes(des_de),
    queryFn: () => fetchAvisComptes(des_de),
    enabled: llest,
  })

  const actius = new Set((members.data ?? []).filter((m) => m.estat === 'actiu').map((m) => m.id))
  const comptats = compta(comptes.data ?? [], des_de, fins_a, pesos)
  for (const id of comptats.keys()) if (!actius.has(id)) comptats.delete(id)

  const marcatsPerEstat = quantsPerEstat(comptats, llindars)
  const marcats = marcatsPerEstat.avis + marcatsPerEstat.risc + marcatsPerEstat.expulsio

  return {
    perEstat: { ok: actius.size - marcats, ...marcatsPerEstat },
    marcats,
    llest: llest && comptes.isSuccess && members.isSuccess,
  }
}
