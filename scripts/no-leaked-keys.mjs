#!/usr/bin/env node
/**
 * Fails if a privileged credential is present in the built bundle.
 *
 * It looks for key *values*, not for the words. Grepping `dist/` for
 * "service_role" or "sb_secret_" matches supabase-js itself — the library
 * carries a `startsWith('sb_secret_')` format check and mentions the service
 * role throughout its JSDoc — so that version of this check fails on every
 * clean build, and a guard that always fails gets deleted rather than fixed.
 *
 * Two shapes are real:
 *   1. a new-format secret key: sb_secret_ followed by a key body;
 *   2. a legacy key, which is a JWT whose payload says role: service_role.
 *      Those cannot be spotted textually, so any JWT-shaped token found is
 *      decoded and its role read.
 *
 * Source maps are in scope. Shipping one that contains the key leaks it just
 * as thoroughly as shipping the key.
 */
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { relative, sep } from 'node:path'

const DIST = process.argv[2] ?? 'dist'

const SECRET_KEY = /sb_secret_[A-Za-z0-9_-]{16,}/g
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g

function jwtRole(token) {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    )
    return JSON.parse(json).role ?? null
  } catch {
    return null
  }
}

const files = globSync(`${DIST}/**/*.{js,mjs,cjs,css,html,map,json,webmanifest}`)
if (files.length === 0) {
  console.error(`no build output found in ${DIST}/ — run the build first`)
  process.exit(1)
}

const findings = []

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const where = relative(process.cwd(), file).split(sep).join('/')

  for (const hit of text.match(SECRET_KEY) ?? []) {
    findings.push(`${where}: a new-format secret key (${hit.slice(0, 18)}…)`)
  }

  for (const token of text.match(JWT) ?? []) {
    const role = jwtRole(token)
    if (role && role !== 'anon' && role !== 'authenticated') {
      findings.push(`${where}: a JWT with role "${role}"`)
    }
  }
}

if (findings.length > 0) {
  console.error('A privileged credential is present in the build output:\n')
  for (const f of findings) console.error(`  ${f}`)
  console.error(
    '\nThe service role bypasses every policy in supabase/. If a query is\n' +
      'coming back empty, the answer is a policy or a SECURITY DEFINER\n' +
      'function, not this key.',
  )
  process.exit(1)
}

console.log(`no privileged credential in ${String(files.length)} build artefacts`)
