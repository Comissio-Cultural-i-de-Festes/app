#!/usr/bin/env node
/**
 * Fails if src/lib/database.types.ts is not what the current migrations
 * produce.
 *
 * Generated types are only worth having if they are true. A stale file is
 * worse than none: it type-checks a column that no longer exists and silently
 * agrees with code that will fail at runtime, and nothing in a normal build
 * notices. So the schema and the file are compared on every CI run, against a
 * database built from the migrations in this commit.
 *
 * Run `npm run db:types` to fix a failure.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const FILE = 'src/lib/database.types.ts'

let committed
try {
  committed = readFileSync(FILE, 'utf8')
} catch {
  console.error(`${FILE} is missing. Run: npm run db:types`)
  process.exit(1)
}

let fresh
try {
  fresh = execFileSync('npx', ['supabase', 'gen', 'types', 'typescript', '--local'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    shell: process.platform === 'win32',
  })
} catch (error) {
  console.error('Could not generate types. Is the local stack running (npm run db:start)?')
  console.error(error.message)
  process.exit(1)
}

// The generator's trailing newline varies between versions; nothing else may.
if (fresh.trimEnd() === committed.trimEnd()) {
  console.log(`${FILE} matches the schema.`)
  process.exit(0)
}

console.error(
  `${FILE} does not match the migrations.\n\n` +
    'A migration changed the schema and the generated types were not updated. ' +
    'Anything reading a renamed or removed column still type-checks against ' +
    'the old shape and will fail at runtime instead.\n\n' +
    '  npm run db:reset && npm run db:types\n',
)
process.exit(1)
