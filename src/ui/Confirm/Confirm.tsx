import type { ReactNode } from 'react'

import { Button } from '@/ui/Button/Button'

/**
 * «Segur?», obert a la mateixa fila.
 *
 * EL PATRÓ BO JA EXISTIA i el va escriure la llista de socis: en comptes d'un
 * diàleg, la fila creix i ensenya què passarà i dos botons. No és estètica.
 * Un diàleg de debò ha d'atrapar el focus, tornar-lo on era, tancar-se amb
 * Escape i amagar la resta de la pantalla del lector; un panell que s'obre
 * dins del document no ha de fer res d'això perquè el focus no se'n va enlloc,
 * i el `confirm()` del navegador —l'altra sortida— no es pot traduir, no es pot
 * escriure en dues línies i a l'iPhone en mode standalone surt amb el domini a
 * sobre. El repositori ja tenia quatre còpies d'aquest panell i les quatre
 * havien derivat: 46px i 50px d'alçada, dos colors de cancel·lar, i una que es
 * podia prémer dos cops mentre la primera encara anava.
 *
 * EL COS EL POSA QUI CRIDA. Les quatre confirmacions diuen coses molt
 * diferents —una frase, un títol amb un cos a sota, tres conseqüències
 * numerades, o un camp de text obligatori per dir per què— i encabir-les en
 * paràmetres hauria volgut dir un component amb `title`, `body`, `detail` i
 * `children` on tres són opcionals. El que sí que és igual sempre, i és el que
 * s'havia separat, és el parell de botons: quina cara fan, quin és el
 * destructiu, quin és el de fugir i que tots dos facin la mateixa alçada.
 *
 * `grid-cols-[1fr_auto]` I NO `flex`. El `<Button>` de la casa porta `w-full`
 * —és el que fa que un CTA ocupi la pantalla— i dins d'un flex amb `flex-none`
 * aquell 100% es queda i el «Cancel·la» s'empassa la fila. En una graella, la
 * columna `auto` es mida pel contingut i el 100% del botó és 100% de la seva
 * cel·la, que és exactament el que es vol. `items-stretch` és el mateix motiu
 * que `ButtonGroup`: quan el destructiu creix a dues línies en català, el de
 * fugir creix amb ell en comptes de deixar la fila desmanegada.
 *
 * DESTRUCTIU VOL DIR AMBRE. El vermell d'aquesta app és la marca i no pot voler
 * dir «malament» enlloc —`src/design/states.test.ts` ho vigila—, i per això el
 * botó que fa la cosa va amb el contorn ambre i no ple: fer-lo ple i vermell
 * seria el CTA més cridaner de la pantalla per a l'acció que menys convida.
 */
export function Confirm({
  children,
  cta,
  cancel,
  busy = false,
  disabled = false,
  onConfirm,
  onCancel,
  className = '',
}: {
  /** Què passarà, dit abans de fer-ho. */
  readonly children: ReactNode
  readonly cta: string
  readonly cancel: string
  /** Mentre la crida va: desactiva els dos botons, no només el de fer. */
  readonly busy?: boolean
  /** Quan encara falta alguna cosa —una nota obligatòria, per exemple. */
  readonly disabled?: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
  readonly className?: string
}) {
  return (
    <div className={className}>
      {children}
      <div className="mt-5 grid grid-cols-[1fr_auto] items-stretch gap-4">
        <Button variant="destructive" disabled={disabled || busy} onClick={onConfirm}>
          {cta}
        </Button>
        {/* També es desactiva mentre va. Tancar el panell al mig d'una crida
            que ja ha sortit no l'atura: el que fa és amagar on sortirà la
            resposta, i llavors sembla que no ha passat res. */}
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          {cancel}
        </Button>
      </div>
    </div>
  )
}
