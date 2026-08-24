/**
 * Preview-only stand-in for src/config/brand.ts.
 *
 * Same shape as the real module. It exists because the real one imports
 * `./env` RELATIVELY, which no `@/…` alias can intercept — stubbing the brand
 * alias too is what keeps src/config/env.ts out of the bundle graph entirely.
 */
import { env } from './env'

export const brand = {
  name: env.appName,
  shortName: env.appShortName,
  description: env.appDescription,
  tagline: env.appTagline,
} as const
