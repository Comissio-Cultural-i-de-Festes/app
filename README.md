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

## Signing in

Sign in with Google. There is no association domain, so there is no verified
sender and no real email can be sent — Supabase's built-in SMTP allows two
messages an hour, and the first event of the year is about a hundred sign-ups
in one evening.

**Google identifies people; it does not admit them.** Anyone with a Google
account can get as far as a profile, and that profile arrives as `pendent`.
The gate is still the invitation code, redeemed by `redeem_invite()` once
there is a session, exactly as before.

Signing in by email is still in the codebase behind `VITE_AUTH_EMAIL_FALLBACK`,
along with its templates. Set it to `true` and the email field, the magic link
and the six-digit code all come back alongside the Google button. It is off
because it cannot deliver, not because it was removed.

### Checking the iPhone round trip

**Do this on a real iPhone before the first event.** Ten minutes, and anyone on
the committee can do it. It is the one thing about this app that cannot be
verified from a laptop, and if it fails the consequence is not a small one.

Why it matters: a web app added to the iPhone home screen gets its own storage,
separate from Safari. A session created on one side does not exist on the
other. The old magic link fell into exactly that hole — the link was tapped in
Mail, which has no way to hand back to a home-screen icon, so it opened Safari
and the installed app stayed signed out. That is why the email carried a
six-digit code.

Google should not have the same problem, for a structural reason: the app
itself navigates away, and Google redirects back to our own origin, which is
inside the app's manifest scope. Since iOS 12.2 an out-of-scope navigation from
an installed app opens in an in-app browser, and a redirect back _into_ scope
returns control to the app. The PKCE verifier stays in the context that started
the trip, which is the same one that receives the code.

That is the theory. It has not been proved on a handset.

**The test**

1. On an iPhone, in Safari, open the app and add it to the home screen.
2. Close Safari completely. Open the app **from the icon**.
3. Tap _Entra amb Google_ and complete the Google sign-in.
4. Watch where you end up.

**Pass:** you land back inside the app, full screen, with no Safari address bar,
and you are signed in.

**Fail, and what each looks like:**

| What you see                                                                                   | What it means                                                                                     |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| You end up in Safari with an address bar, signed in there, and the icon is still signed out    | iOS sent the round trip to Safari instead of the in-app browser. This is the one that matters.    |
| The app reopens showing _"Sembla que has entrat però la sessió s'ha quedat al navegador"_      | The same thing, caught by the app. That message only ever appears in this case.                   |
| Google shows an error about a disallowed browser or user agent                                 | Google is refusing the in-app browser as an embedded webview.                                     |
| Everything works, but it asks for your Google password even though you are signed in elsewhere | Not a failure. The in-app browser does not share Safari's cookies. Mildly annoying, nothing more. |

**If it fails.** The installed app cannot sign anybody in, which makes promoting
installation on iOS actively harmful. Two things to do, in this order:

1. Set `VITE_AUTH_EMAIL_FALLBACK=true` and redeploy. The email path with the
   six-digit code comes back and works from the icon, because a typed code does
   not care which storage jar it is typed into. It will hit the SMTP rate limit
   at scale, so pair it with a real SMTP provider or a bought domain.
2. Until that is sorted, stop showing the install screen on iOS — a signed-out
   icon is worse than a browser tab.

Report the result either way: an issue on the repo, or a note wherever the
committee keeps decisions. The next person to wonder should not have to test it
again.

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

### The audit trail, and answering a subject access request

`audit_log` records role changes, membership approvals and payment marks — who
did what to whom. It exists because the committee turns over every year and
"who made them an admin?" is otherwise unanswerable six months later.

**Kept for 24 months, then deleted.** Two academic years: long enough for the
outgoing committee and the next one to be asked about a decision, short enough
that it is not a permanent record. A `pg_cron` job runs
`private.purge_audit_log()` nightly at 04:30. Nobody can run it by hand — not
even an admin — because a trail the people in it can clear is not a trail.

**A member does not see their own rows in the app.** That is deliberate: the
trail records what the committee did, and showing somebody a partial view of
it would mislead more than showing none.

**That is a product decision, not a legal one.** If someone exercises their
right of access under GDPR, the association has to hand over what it holds
about them, whether or not the interface shows it. Nobody can do that from the
app, so here is how.

An owner runs this in the Supabase SQL editor. Replace the uuid on the first
line with the person's profile id — plain SQL, no psql meta-commands, because
the SQL editor does not support them.

```sql
-- Everything the association holds about one person.
-- Run as the project owner. Give them the output, not the query.
with subject as (select '00000000-0000-0000-0000-000000000000'::uuid as id)
select 'perfil' as font, to_jsonb(p) as dades
  from public.profiles p, subject s where p.id = s.id
union all
select 'contacte', to_jsonb(c)
  from public.profile_contact c, subject s where c.id = s.id
union all
select 'inscripcions', to_jsonb(a)
  from public.attendances a, subject s where a.user_id = s.id
union all
select 'punts', to_jsonb(l)
  from public.points_log l, subject s where l.user_id = s.id
union all
select 'propostes', to_jsonb(pr)
  from public.proposals pr, subject s where pr.user_id = s.id
union all
select 'vots', to_jsonb(v)
  from public.proposal_votes v, subject s where v.user_id = s.id
union all
select 'invitacio_usada', to_jsonb(iu)
  from public.invite_uses iu, subject s where iu.user_id = s.id
union all
-- Both directions: rows about them, and rows recording what they did while on
-- the committee. Somebody asking what is held about them is owed both.
select 'registre_sobre_ell', to_jsonb(al)
  from public.audit_log al, subject s where al.target_id = s.id
union all
select 'registre_fet_per_ell', to_jsonb(al)
  from public.audit_log al, subject s where al.actor_id = s.id;
```

`profile_secret` is deliberately absent. It holds one QR token, which is a
credential rather than information about the person; hand it over and anybody
holding the export can be checked in as them. If they ask specifically, rotate
it first.

**Still to do before launch:** the GDPR notice has to name traceability as a
purpose for processing, alongside the obvious ones. It is a legitimate purpose
and a short paragraph, but it has to be written down before the first sign-up,
not after.

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
