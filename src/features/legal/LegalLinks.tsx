import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { PRIVACY_PATH, TERMS_PATH } from '@/App'

/**
 * Els dos enllaços legals, per a les pantalles d'abans d'entrar.
 *
 * A la porta i a l'alta, i no només al perfil: al perfil hi arribes quan ja has
 * entrat i ja has donat el telèfon, i llavors llegir què en fem és tard. Per
 * això les dues rutes es llegeixen sense sessió.
 *
 * Dos `Link` i una frase a part, en comptes d'una frase amb els enllaços a
 * dins: posar-hi marques voldria dir partir la cadena en tres o fer servir
 * `Trans`, i llavors la traducció deixa de ser una línia del fitxer de locale
 * per passar a ser una plantilla amb ordre de paraules fix. Amb tres idiomes
 * això es trenca a la primera.
 */
export function LegalLinks({ className = '' }: { readonly className?: string }) {
  const { t } = useTranslation()

  return (
    <p className={`text-sm-lo text-fg-muted-lo [text-wrap:pretty] ${className}`}>
      <Link to={PRIVACY_PATH} className="text-fg-muted underline-offset-2 hover:underline">
        {t('legal.privacy')}
      </Link>
      <span aria-hidden="true"> · </span>
      <Link to={TERMS_PATH} className="text-fg-muted underline-offset-2 hover:underline">
        {t('legal.terms')}
      </Link>
    </p>
  )
}
