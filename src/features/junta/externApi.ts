import { unwrap } from '@/lib/db'
import { supabase } from '@/lib/supabase'

/**
 * La junta marca o desmarca algú com a extern.
 *
 * UN `update` DIRECTE I NO UNA RPC. `profiles_update_admin` ja deixa a la junta
 * escriure qualsevol fila i el grant de columna de la 96 hi inclou `extern`;
 * una funció definer no protegiria res que la política no protegeixi ja, i
 * seria una signatura més per mantenir.
 *
 * MARCAR BUIDA L'ESCOLA, EL GRAU I EL CURS a la mateixa sentència.
 * `profiles_extern_sense_escola` no deixa ser extern amb escola, i el grau i el
 * curs sense escola serien dues línies a la fitxa que ja no volen dir res.
 *
 * DESMARCAR NO TORNA CAP ESCOLA, perquè no se sap quina era —i si s'havia
 * inventat, la vella és justament la que no es vol—. Qui queda sense escola i
 * sense ser extern és, per a la porta, algú que encara no ha contestat el
 * primer cop: la pròxima vegada que obri l'app la triarà ell mateix.
 */
export async function setExtern(userId: string, extern: boolean): Promise<void> {
  await unwrap(
    supabase
      .from('profiles')
      .update(extern ? { extern: true, escola: null, grau: null, curs: null } : { extern: false })
      .eq('id', userId)
      .select('id'),
  )
}
