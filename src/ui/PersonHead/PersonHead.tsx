import type { ReactNode } from 'react'

import { Avatar } from '@/ui/Avatar/Avatar'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

/**
 * La cara, el nom i la línia de sota: com es presenta una persona.
 *
 * ES DIU `PersonHead` I NO PEL NOM DE CAP DE LES PANTALLES QUE L'USEN, i això
 * és una decisió i no un tràmit. N'hi ha tres i cap no mana sobre les altres:
 * el teu propi perfil (`/perfil`), el perfil públic d'un altre soci
 * (`/soci/:id`) i la fitxa de la junta d'una persona (`/junta/socis/:id`).
 * `SociScreen` ja es diu així precisament perquè `MemberScreen` estava ocupat;
 * batejar la capçalera compartida amb el nom d'una de les tres hauria repetit
 * aquell mateix embolic un pis més avall.
 *
 * QUÈ ERA DIFERENT I QUÈ MANA ARA. L'avatar feia 72px a dues de les tres i 56 a
 * la de la junta; la separació era `gap-8` a dues i `gap-6` a la tercera; i la
 * línia de sota el nom era `text-md-lo font-semibold text-fg-muted` a dues i
 * `text-sm-lo text-fg-muted-lo` a la de la junta. En els tres casos guanya la
 * majoria, que a més és la versió que es veu més: qui obre la fitxa de la junta
 * d'algú ve gairebé sempre de veure aquella mateixa persona a `/soci/:id` o al
 * rànquing, i que la cara encongeixi pel camí fa dubtar si és la mateixa fila.
 *
 * EL FINAL DE LA LÍNIA ARRIBA FET. La línia la compon `memberSubtitle`
 * —escola · curs · grau · cua— i el quart tros no és el mateix a totes tres: al
 * perfil públic és «soci des de 2024» i a la fitxa de la junta és «De baixa».
 * Aquesta capçalera rep la cadena ja muntada i no decideix res sobre ella: si
 * decidís, hauria de saber qui la mira, i aleshores la regla de qui veu «De
 * baixa» viuria en un component de `ui/` en comptes d'a la pantalla que ho sap.
 *
 * TRES RANURES I NO TRES BOOLEANS. `avatar` perquè al teu propi perfil la cara
 * és un enllaç amb la insígnia de càmera a sobre i a les altres dues és una
 * imatge i prou; `note` per a la línia de marca de sota el nom («Ets tu», «Ets
 * de la junta»); i `aside` per al rètol del càrrec, que només surt a la fitxa de
 * la junta. Amb booleans, aquest fitxer hauria hagut de saber el text i el camí
 * de cadascuna, o sigui saber de quina pantalla parla.
 */

/** La mida de la cara, perquè qui composi la seva ranura faci servir la mateixa. */
export const PERSON_AVATAR = 72

export function PersonHead({
  src = null,
  avatar,
  nombre,
  subtitle,
  note,
  aside,
  className = '',
}: {
  /** La foto, quan la ranura `avatar` no s'usa. */
  readonly src?: string | null
  /** La cara, quan no és només una foto: un enllaç, una insígnia a sobre. */
  readonly avatar?: ReactNode
  readonly nombre: string
  /** Ja composta, i amb el final que aquesta pantalla hi vulgui. */
  readonly subtitle?: string
  /** La línia de marca de sota el nom, si n'hi ha. */
  readonly note?: ReactNode
  /** El rètol de la dreta: el càrrec, si n'hi ha. */
  readonly aside?: ReactNode
  readonly className?: string
}) {
  return (
    <header className={`flex items-center gap-8 ${className}`}>
      {avatar ?? <Avatar src={src} size={PERSON_AVATAR} />}
      <div className="min-w-0 flex-1">
        <h1 className="display text-d-s tracking-[-0.045em] [text-wrap:balance]">{nombre}</h1>
        {subtitle === undefined || subtitle === '' ? null : (
          <p className="mt-[3px] text-md-lo font-semibold text-fg-muted">{subtitle}</p>
        )}
        {note === undefined || note === null ? null : (
          <p className="mt-[6px] text-sm-lo font-bold text-brand-label">{note}</p>
        )}
      </div>
      {aside}
    </header>
  )
}

/**
 * La silueta de la capçalera, amb la mida exacta del que ve.
 *
 * No és decoració: una frase de «Un segon…» ocupa una línia i la capçalera de
 * debò ocupa 72px, o sigui que el nom de la persona apareixia seixanta píxels
 * més avall d'on s'havia mirat. Les mides d'aquí són les de dalt, i per això
 * viuen al mateix fitxer: separades, la que es quedés enrere tornaria a fer
 * saltar la pantalla i ningú no ho notaria fins a veure-ho.
 */
export function PersonHeadSkeleton({ className = '' }: { readonly className?: string }) {
  return (
    <Skeleton className={`flex items-center gap-8 ${className}`}>
      <SkeletonBar w="w-[72px]" h="h-[72px]" className="flex-none rounded-full" />
      <span className="min-w-0 flex-1">
        <SkeletonBar w="w-[70%]" h="h-[22px]" />
        <SkeletonBar w="w-[50%]" h="h-[13px]" className="mt-[6px]" />
      </span>
    </Skeleton>
  )
}
