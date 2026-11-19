import type { MyProfile } from '@/features/session/profile'

/**
 * El que es va saber d'aquest mòbil l'última vegada, per no esperar-ho.
 *
 * Les consultes de l'Inici i de la junta no depenen del perfil per res més que
 * per saber si val la pena fer-les: a un pendent la RLS li torna buit i a un
 * soci no li serveixen les de la junta. Esperar el perfil per decidir-ho posava
 * tota l'arrencada una volta de xarxa més tard. Amb el que va dir el darrer
 * cop, l'arrencada pot sortir en paral·lel; si el perfil d'ara diu una altra
 * cosa, només s'ha perdut alguna petició, que no és cap error.
 *
 * ÉS UNA PISTA I NO UNA DECISIÓ. No es fa servir per ensenyar ni amagar res:
 * la porta de la junta continua mirant el perfil de debò, i el que protegeix
 * les dades és la RLS. Va lligada a l'usuari, perquè un mòbil passa de mà en
 * mà i la pista d'un altre no ha de fer sortir peticions de la junta a qui
 * entra després.
 */
export interface StartHint {
  readonly user: string
  readonly estat: MyProfile['estat']
  readonly role: MyProfile['role']
  /** Sense escola l'Inici no és el seu: la porta el porta al primer cop. */
  readonly escola: boolean
}

const KEY = 'comi.start-hint'

export function readStartHint(userId: string): StartHint | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<StartHint> | null
    if (parsed?.user !== userId) return null
    if (parsed.estat !== 'pendent' && parsed.estat !== 'actiu' && parsed.estat !== 'baixa') {
      return null
    }
    if (parsed.role !== 'member' && parsed.role !== 'admin' && parsed.role !== 'owner') return null
    if (typeof parsed.escola !== 'boolean') return null
    return { user: userId, estat: parsed.estat, role: parsed.role, escola: parsed.escola }
  } catch {
    return null
  }
}

export function writeStartHint(userId: string, profile: MyProfile): void {
  try {
    const hint: StartHint = {
      user: userId,
      estat: profile.estat,
      role: profile.role,
      escola: profile.escola !== null,
    }
    localStorage.setItem(KEY, JSON.stringify(hint))
  } catch {
    /* Sense pista l'arrencada és la de sempre, una volta més lenta. */
  }
}

/** En tancar sessió, com les cues: la pista és de qui hi era. */
export function clearStartHint(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* Res a fer, i tampoc no hi havia res a esborrar. */
  }
}

export type StartPlan = 'home' | 'junta' | null

/** Què val la pena demanar abans que arribi el perfil, i només per a qui ho aprofitarà. */
export function startPlan(pathname: string, hint: StartHint | null): StartPlan {
  if (hint?.estat !== 'actiu') return null
  if (pathname === '/') return hint.escola ? 'home' : null
  if (pathname === '/junta' && (hint.role === 'admin' || hint.role === 'owner')) return 'junta'
  return null
}
