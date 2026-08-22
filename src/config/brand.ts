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
} as const
