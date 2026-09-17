/**
 * «Ha anat bé», en una línia.
 *
 * TRES FORMES PER A LA MATEIXA COSA. Dins d'una mateixa tanda hi convivien:
 * un `<p role="status">` verd —la baixa d'un soci, l'ajust de punts—, un
 * `<span>` pelat també verd —el barem, el catàleg d'avisos— i, a un lloc,
 * res de res. Les tres es veuen gairebé igual i només la primera existeix per
 * a qui no mira la pantalla: un `<span>` de color no l'anuncia cap lector, o
 * sigui que qui desa un número amb el teclat no rep cap resposta.
 *
 * NO ÉS UN `Notice`. Aquell és l'avís amb el filet de color i el seu coixí, i
 * el seu propi comentari ja diu que aquestes confirmacions no hi han de passar:
 * els posaria una caixa que no demanaven. Això és l'altra meitat, la línia.
 *
 * LA REGIÓ VIVA NO ES DESMUNTA. El `<p role="status">` es pinta sempre, amb la
 * cadena buida quan no hi ha res a dir, i no `{fet ? <p/> : null}`. Un lector
 * de pantalla ha de tenir la regió abans que el text hi caigui; una que neix
 * amb el missatge a dins és una loteria segons el navegador. Quan no hi ha
 * missatge tampoc no hi ha cap classe, així que el paràgraf buit no ocupa res i
 * no deixa el coixí de dalt penjat enmig del formulari.
 *
 * EL MISSATGE HA DE SOBREVIURE EL QUE L'HA PRODUÏT, i això no es pot fer aquí:
 * és qui crida qui ha de fotografiar el nom o el número abans de buidar el
 * formulari o abans que la fila canviï de pestanya. Aquí només arriba la
 * cadena, i que arribi una cadena i no un booleà és el que fa que no es pugui
 * llegir una variable que ja ha canviat.
 */

const SIZES = { md: 'text-md', sm: 'text-sm' } as const

export function DoneLine({
  message,
  size = 'md',
  className = '',
}: {
  /** El text, o `null` quan encara no hi ha res a confirmar. */
  readonly message: string | null
  readonly size?: keyof typeof SIZES
  /** El coixí, que el decideix qui la col·loca. */
  readonly className?: string
}) {
  return (
    <p
      role="status"
      className={
        message === null
          ? ''
          : `${SIZES[size]} font-bold text-success [text-wrap:pretty] ${className}`
      }
    >
      {message ?? ''}
    </p>
  )
}
