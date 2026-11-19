import { useEffect } from 'react'
import { useNavigate } from 'react-router'

import { rememberInvite } from './pendingInvite'
import { takeReturn } from './returnTo'
import { readInviteCode } from './useInvite'

/**
 * Porta qui acaba d'entrar a la fitxa on volia anar.
 *
 * Penja de l'Inici i no d'`App`, i és tot el sentit: l'Inici queda darrere de
 * `RequireOnboarding`, o sigui que un usuari nou no hi arriba fins que ha
 * passat per `/primer-cop`, i en acabar el formulari torna aquí i només
 * aleshores es recull la ruta. Navegar-hi des de dalt el deixava a mig camí:
 * el porter el rebotava a les preguntes i la ruta ja s'havia gastat.
 *
 * El `?codi=` és l'altra banda. L'adreça on aterra Google en pot dur un i el
 * bescanvi el llegeix d'allà en muntar `App`, que és després d'aquest efecte;
 * navegar-hi abans el deixaria sense. Es desa, doncs, abans de moure res —el
 * bescanvi també el busca a `pendingInvite`— i la invitació no depèn de
 * l'adreça.
 */
export function ReturnToLink() {
  const navigate = useNavigate()

  useEffect(() => {
    const path = takeReturn()
    if (path === null) return
    const code = readInviteCode()
    if (code !== null) rememberInvite(code)
    void navigate(path, { replace: true })
  }, [navigate])

  return null
}
