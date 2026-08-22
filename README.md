# app-comi

A mobile-only PWA for a university student association: events, QR check-in,
points and rankings. Built for the Comissió Cultural i de Festes del
TecnoCampus, and MIT-licensed so other campus associations can fork it.

The problem it exists to solve is retention in the second term. Everything in
here — the ranking by contribution rather than consumption, the public "yes"
list, the scheduled reveals — is aimed at that.

## Stack

|          |                                                                 |
| -------- | --------------------------------------------------------------- |
| Frontend | React 19 + TypeScript + Vite 8                                  |
| Styling  | Tailwind v4 over CSS custom properties. Dark theme only         |
| PWA      | `vite-plugin-pwa` (Workbox), installable, `display: standalone` |
| Backend  | Supabase — Postgres, RLS, Auth, Edge Functions                  |
| i18n     | react-i18next — Catalan (default), Spanish, English             |
| Hosting  | Cloudflare Pages                                                |

## Getting started

Requires Node 24 (see `.nvmrc`), npm, and Docker Desktop for the local Supabase
stack.

```
npm ci
cp .env.example .env      # fill it in — see the note on hex colours inside
npm run dev
```

## Database

Migrations are versioned in this repo and applied with the Supabase CLI. The
schema is never edited through the dashboard.

```
npm run db:start          # Postgres, Auth and PostgREST in Docker
npm run db:reset          # re-applies every migration, then the seeds
npm run db:new -- nom     # a new migration file
npm run db:test           # the pgTAP policy tests
npm run test:rls          # the same policies, through PostgREST
npm run db:lint
npm run db:stop
```

Applying to a hosted project:

```
npx supabase link --project-ref <ref>
npm run db:push
```

`supabase/seed/` is applied by `db:start` and `db:reset` and never by
`db:push`, which is why the test helpers live there rather than in a migration.

## Security

**The anon key is public by design.** It ships in the JavaScript bundle and is
visible in devtools. Row Level Security is the only boundary, so every table
has policies and every policy has a test.

**The `service_role` key is not in this repo**, not in `.env.example`, not
commented out, and never in the frontend. It bypasses every policy in
`supabase/`. It lives as a Supabase Functions secret, and the platform injects
it into Edge Functions automatically — the check-in function deliberately does
not use it at all.

Two test layers, because each is blind to the other's failures:

- **pgTAP** (`supabase/tests/`) asserts what has no HTTP signature: RLS
  actually enabled, views that are `security_invoker`, definer functions with a
  pinned `search_path`, the partial unique index the check-in depends on.
- **Vitest through PostgREST** (`tests/rls/`) asserts what has no SQL
  signature: resource embedding, the filtered `count=exact`, the status codes
  the UI branches on, and the real GoTrue signup path.

Two things worth knowing before writing a query:

- `profiles` is ordinary: `select('*')` works and carries nothing sensitive.
  The check-in credential lives in `profile_secret` (own row only, and not
  readable by admins either) and the phone number in `profile_contact` (own row
  plus the junta). They are separate tables rather than revoked columns
  because a revoke made `*` fail, and a guarantee that surfaces as a
  permission error on an ordinary query is one somebody eventually removes.
- Scheduled content is filtered with Postgres `now()`. An `if` in React is not
  hiding anything — the response is in the network tab either way.

## Brand colours

There are two reds and they are not interchangeable.

|                  | Value                                 | Used for                                                  |
| ---------------- | ------------------------------------- | --------------------------------------------------------- |
| Logo red         | `#991B16` · `oklch(0.443 0.162 28.4)` | The logo, the favicon, print. **Never in the interface.** |
| `--ds-brand`     | `oklch(0.62 0.22 25)`                 | The on-screen identity: fills, accents, selection         |
| `--ds-brand-cta` | `oklch(0.58 0.22 25)`                 | Filled buttons only — see the note in `tokens.css`        |
| `--ds-error`     | `oklch(0.74 0.19 48)`                 | Errors. Never either of the reds above                    |

The logo red is too dark to sit under text on a dark background, which is why
the screen version is lighter. State colours never use the brand hue: the
scanner has to be readable in half a second, at night, and if red meant both
"us" and "rejected" it would not be.

## Forking this for another association

Three places, and nothing else is association-specific:

1. `src/styles/tokens.css` → the `BRAND` block. Seven colours and a shadow. If
   your colour is not red, also replace hue `25` in the `SURFACES` block, since
   the neutrals are tinted with the brand hue.
2. `public/` → the five icon files.
3. `.env` → name, short name, description, theme colour.

## Conventions

- **Conventional Commits**, in Catalan: `type(scope): lowercase imperative`.
  Types: `feat` `fix` `chore` `docs` `refactor` `test` `style`. One commit per
  logical change. No co-author trailers, no generated-with footers.
- **No extra markdown files.** This README and genuinely necessary docs only.
- Every user-facing string goes through i18next from the first commit.
  `npm test` fails if a key exists in `ca.json` and is missing from `es.json`
  or `en.json`.
- **Copy belongs to the committee, not to whoever wrote the code**, and it
  lives in two places, not one:
  - `src/i18n/locales/*.json` — everything on screen.
  - `supabase/templates/*.html` plus their subjects in `supabase/config.toml`
    — the sign-in emails. Easy to forget, because nobody on the team sees them
    once sign-in works. Both carry a link _and_ a six-digit code, and the code
    is not optional: see the note in `magic_link.html`.

  Informal Catalan for actions and empty states; plain and unfunny for errors,
  money, the door and anything legal.

- Colours live only in `src/styles/tokens.css`, and no state colour may use the
  brand hue. Both are tested.
- Fixtures are obviously synthetic — NATO alphabet handles, `@example.test`
  addresses, invented school and venue names. CI greps for real-world
  identifiers, because the association is small enough that a realistic
  Catalan name identifies someone even when it was invented.
- Run `npm run check` before opening a pull request.

## Licence

MIT — see `LICENSE`. The association's name and logo are its own and are not
covered by it.
