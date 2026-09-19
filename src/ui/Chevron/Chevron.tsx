/**
 * El «hi ha més cap a dins» d'una fila.
 *
 * ÉS UN COMPONENT PER UNA COSA QUE ÉS UN CARÀCTER, i val la pena dir per què:
 * el caràcter mai no era el problema. El problema era el to. La mateixa fila
 * —una etiqueta, una línia de sota i una fletxa a la dreta— es dibuixava a
 * `text-2xl text-brand-accent` al perfil, al perfil d'un altre soci, a les nits
 * i a la pantalla de pagaments, i a `text-lg text-fg-muted` a la llista de
 * socis de la junta, que és la pantalla del costat. Dues mides i dos colors per
 * al mateix afordament fan que la segona pantalla sembli d'una altra app.
 *
 * GUANYA LA MAJORIA, i la majoria és clara: deu llocs porten el vermell gran i
 * cinc el gris petit. No és antiguitat ni gust —el vermell és el color que
 * aquesta app fa servir per dir «això es pot tocar», i un xebró gris al costat
 * d'una fila que sí que s'obre és una pista més fluixa del que la fila mereix.
 *
 * `aria-hidden` SEMPRE. El xebró no és contingut: el que diu on va la fila és
 * l'enllaç que l'envolta, i un lector de pantalla que digui «major que» després
 * de cada nom és soroll a cada fila d'una llista de quaranta.
 */
export function Chevron({ className = '' }: { readonly className?: string }) {
  return (
    <span aria-hidden="true" className={`flex-none text-2xl text-brand-accent ${className}`}>
      ›
    </span>
  )
}
