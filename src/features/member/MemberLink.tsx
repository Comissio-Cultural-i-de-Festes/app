import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'

import { type MemberFrom, memberPath } from './route'

/**
 * La porta al perfil d'un altre soci.
 *
 * Un component i no cinc `<Link to={...}>` repartits: a més del camí, que viu a
 * `route.ts`, cada enllaç ha de deixar dit d'on ve perquè la capçalera de
 * l'altra banda pugui dibuixar la fletxa de tornar amb el nom del lloc. Fer-ho
 * a mà cinc vegades vol dir que la sisena se n'oblida i aquella fletxa porta a
 * un lloc on aquella persona no havia estat.
 *
 * `label` és com es diu el lloc d'on es marxa, ja traduït: el component no
 * crida `t()` a posta, perquè cada pantalla en diu una cosa diferent —el títol
 * de la festa a «qui hi ha dins», «Rànquing» al rànquing— i endevinar-ho des
 * d'aquí seria fer el mateix `if` cinc vegades en un sol lloc.
 */
export function MemberLink({
  userId,
  label,
  className = '',
  children,
}: {
  readonly userId: string
  readonly label: string
  readonly className?: string
  readonly children: ReactNode
}) {
  const { pathname, search } = useLocation()

  return (
    <Link
      to={memberPath(userId)}
      state={{ from: `${pathname}${search}`, fromLabel: label } satisfies MemberFrom}
      className={className}
    >
      {children}
    </Link>
  )
}
