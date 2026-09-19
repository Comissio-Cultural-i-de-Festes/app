import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { Chevron } from '@/ui/Chevron/Chevron'

/**
 * La fila de llista que porta cap a un altre lloc.
 *
 * QUÈ QUEDAVA PER UNIFICAR. La fila del llibre major ja té el seu component
 * —`LedgerRow`, i la seva forma a `LEDGER_ROW`— des de la funció #3. El que
 * quedava és l'altra fila, la de navegar: una etiqueta, una línia de sota que
 * diu on porta, i el xebró a la dreta. N'hi havia deu còpies escrites a mà, i
 * ja s'havien separat en tres coses —una portava `text-fg` al títol i una
 * altra no, una truncava el subtítol i una altra el deixava saltar de línia, i
 * el xebró tenia dues mides i dos colors—. Cap de les tres és greu tota sola; la
 * suma és que dues pantalles seguides no semblen la mateixa app.
 *
 * ÉS DE NAVEGAR I NO DE FER. Una fila que fa alguna cosa —el commutador de
 * «surto al rànquing», el botó de marcar algú com a pagat— es queda com un
 * `<button>` escrit a mà: el xebró promet que darrere hi ha una altra pantalla,
 * i posar-lo sobre una acció és mentir sobre què passarà en tocar-la.
 *
 * `ROW` S'EXPORTA A BANDA perquè hi ha dos casos que no poden fer servir
 * `NavRow`: la fila que ha de ser un `MemberLink` —aquell component és qui sap
 * deixar dit d'on ve la navegació, i tornar-ho a fer aquí seria una segona
 * còpia d'aquella regla— i la silueta de càrrega, que vol la forma de la fila
 * sense la fila. Totes dues componen `ROW` + `RowBody` + `Chevron` a mà.
 *
 * DESCARTAT: un `NavRow` amb un `state` propi que fes ell mateix el camí cap a
 * `/soci/:id`. Hauria estalviat les tres línies de la composició i hauria posat
 * a dins d'un component de `ui/` una regla que és de `features/member` —quin és
 * el camí d'un soci i què s'hi deixa dit—, que és exactament el que `route.ts`
 * existeix per tenir escrit una sola vegada.
 */

/** La forma de la fila: la mateixa alçada i la mateixa vora a tot arreu. */
export const ROW = 'flex items-center gap-3 border-b border-surface-4 py-[15px]'

/**
 * El text d'una fila: què és, i una línia que ho explica.
 *
 * Els dos trossos són `<span>` i no `<p>` perquè la fila sol ser un `<a>` o un
 * `<button>`, i un paràgraf dins d'un enllaç el navegador el treu de dins.
 */
export function RowBody({
  title,
  sub,
  truncate = false,
}: {
  readonly title: ReactNode
  readonly sub?: ReactNode
  /** Per a un subtítol que pot ser llarg i no s'ha de menjar la fila. */
  readonly truncate?: boolean
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-base font-semibold text-fg">{title}</span>
      {sub === undefined || sub === null || sub === '' ? null : (
        <span
          className={`mt-[3px] block text-sm-lo text-fg-muted-lo ${truncate ? 'truncate' : ''}`}
        >
          {sub}
        </span>
      )}
    </span>
  )
}

/**
 * La fila sencera, amb el seu enllaç i el seu xebró.
 *
 * `to` per a dins de l'app i `href` per a fora. Són dues etiquetes diferents
 * —`<Link>` navega sense recarregar, `<a>` se'n va— i triar-ho amb un booleà
 * hauria deixat que algú passés un `https://` a `to`, que és com es fa una
 * navegació de client cap a un camí que no existeix.
 */
export function NavRow({
  to,
  href,
  title,
  sub,
  truncate = false,
  className = '',
}: {
  readonly to?: string
  readonly href?: string
  readonly title: ReactNode
  readonly sub?: ReactNode
  readonly truncate?: boolean
  readonly className?: string
}) {
  const inner = (
    <>
      <RowBody title={title} sub={sub} truncate={truncate} />
      <Chevron />
    </>
  )
  const shape = `${ROW} no-underline ${className}`

  if (href !== undefined) {
    return (
      // `noreferrer` i no només `noopener`: aquests enllaços se'n van a un
      // tercer, i el que se'n va amb ells és de quina pantalla s'ha sortit.
      <a href={href} target="_blank" rel="noreferrer" className={shape}>
        {inner}
      </a>
    )
  }

  return (
    <Link to={to ?? ''} className={shape}>
      {inner}
    </Link>
  )
}
