import { env } from './env'

/**
 * The association's identity, resolved from configuration.
 *
 * Nothing in this app is hardcoded to one association: the name arrives from
 * the environment and the colours from the BRAND block in styles/tokens.css.
 * A different campus association forks the repo, changes those two things and
 * the icons in public/, and nothing else.
 *
 * The name must never be written into a translation file. Interpolate it:
 *   t('home.welcome', { association: brand.name })
 */
export const brand = {
  name: env.appName,
  shortName: env.appShortName,
  description: env.appDescription,
  tagline: env.appTagline,
  /**
   * Qui respon de les dades, i on se li escriu.
   *
   * Ho demana la política de privadesa: un text que no diu qui és el
   * responsable del tractament no serveix de res. Viu aquí i no a les
   * traduccions pel mateix motiu que el nom —una altra associació ha de poder
   * bifurcar el repositori— i perquè `i18n-parity` rebutja el nom d'aquesta
   * dins de qualsevol fitxer de locale.
   *
   * Qualsevol d'aquests pot ser buit, i la pantalla ho ha de dir en lloc
   * d'amagar-ho: una política amb un forat visible és honesta, i una que se
   * salta la línia fa pensar que no hi havia res a dir.
   */
  legal: {
    entity: env.legalEntity,
    taxId: env.legalTaxId,
    address: env.legalAddress,
    contact: env.legalContact,
  },
} as const
