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
npm run db:types          # regenerate src/lib/database.types.ts
npm run db:types:check    # fail if that file no longer matches the schema
npm run db:lint
npm run db:stop
```

**Run `npm run db:types` after any migration that changes a table, a view or a
function signature, and commit the result.** CI runs `db:types:check` against a
database built from the migrations in the commit and fails if the two disagree.
A stale types file is worse than none: it type-checks a column that no longer
exists and agrees with code that will fail at runtime.

Applying to a hosted project:

```
npx supabase link --project-ref <ref>
npm run db:push
```

`supabase/seed/` is applied by `db:start` and `db:reset` and never by
`db:push`, which is why the test helpers live there rather than in a migration.

### Term dates, and moving them every year

The chips above the ranking — the whole course, first term, second, third —
are rows in `public.ranking_periods`, not constants in the code. **The
committee changes them itself; this needs no developer and no deploy.**

The academic calendar moves every year and the committee turns over every year,
so a term boundary that needs a pull request is a boundary that stays wrong for
the whole of the term it is wrong in: the person who notices is not the person
who can change it.

In the Supabase dashboard, **Table Editor → `ranking_periods`**:

| Column      | What it is                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| `codi`      | `curs`, `t1`, `t2`, `t3`. The app translates these four; anything else falls back to `etiqueta`.      |
| `etiqueta`  | Only for a period you invent. Leave it empty for the four above, or it will override the translation. |
| `starts_at` | When the period opens. Empty means no lower bound.                                                    |
| `ends_at`   | When it closes, **exclusive**. Empty means it never closes.                                           |
| `ordre`     | Left-to-right order of the chips. The first one is what the app opens on.                             |

The intervals are half-open, so the `ends_at` of one term should be the exact
`starts_at` of the next. That way no evening of points falls into both or
neither.

Every September, edit the four rows: move `curs.starts_at` to the first of
September, and shift `t1`, `t2` and `t3` to the new term dates. Leave
`curs.ends_at` empty so the course does not expire on a date nobody is
watching.

A point counts in the term **the event happened in**, not the term the points
were entered in — so entering the setup points for September's party in October
still files them under September.

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

That was the theory, and it holds: it has been run on a real iPhone against the
deployed app — installed from the icon, Safari closed completely — and it comes
back inside the app with a session.

Keep running it anyway. It depends on iOS behaviour that Apple has changed
before and on the Google client being configured correctly for whichever
origin you are testing, so it is worth ten minutes at the start of each year
and after any change to the redirect URLs.

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

## Deploying

Do these in order. The Cloudflare URL does not exist until the first build, and
Supabase needs it afterwards, so anything that depends on it comes last.

Throughout, `<ref>` is the Supabase project ref (the subdomain of the project
URL) and `<project>` is the Cloudflare Pages project name.

### 1. Supabase — enable pg_cron, before anything else

Dashboard → Database → Extensions → search `pg_cron` → enable.

Do this first. The retention migration needs it, and creating the extension
from a migration on a hosted project is known to leave the schema grants
half-set even when the dashboard reports it active. Enabling it here makes the
migration a no-op instead.

### 2. Supabase — push the schema

```
npx supabase link --project-ref <ref>
npm run db:push
```

**Do not run `supabase config push`.** It exists, and the CLI help makes it look
like the right thing to do, but `supabase/config.toml` is tuned for local
development: it would set the project's Site URL to `http://127.0.0.1:5173` and
overwrite the Google credentials with the local test client. Auth settings are
done in the dashboard, in the steps below.

`db push` sends migrations and nothing else — not seeds, not auth config, not
the email templates.

### 3. Google Cloud — the production OAuth client

APIs & Services → Credentials → Create credentials → OAuth client ID → Web
application.

**Authorized redirect URI** — exactly one, and it is Supabase's callback, not
the app's address:

```
https://<ref>.supabase.co/auth/v1/callback
```

Leave **Authorized JavaScript origins** empty. The app never talks to Google
directly; Supabase does the exchange.

On the OAuth consent screen, the application name is what people see on the
Google page as _"Continue to …"_. Put the association's name there.

### 4. Supabase — turn Google on

Authentication → Providers → Google → enable, and paste the client ID and
secret from the previous step.

### 5. Cloudflare Pages — connect and build

Workers & Pages → Create → Pages → Connect to Git → pick the repository.

| Setting                | Value           |
| ---------------------- | --------------- |
| Framework preset       | None            |
| Build command          | `npm run build` |
| Build output directory | `dist`          |
| Root directory         | `/`             |

Environment variables, for **both** Production and Preview:

| Variable                 | Value                                     |
| ------------------------ | ----------------------------------------- |
| `NODE_VERSION`           | `24`                                      |
| `VITE_APP_NAME`          | the association's full name               |
| `VITE_APP_SHORT_NAME`    | the short one, what shows under the icon  |
| `VITE_APP_DESCRIPTION`   | one line                                  |
| `VITE_APP_TAGLINE`       | shown under the wordmark on the door      |
| `VITE_THEME_COLOR`       | `#100909`                                 |
| `VITE_BACKGROUND_COLOR`  | `#100909`                                 |
| `VITE_DEFAULT_LOCALE`    | `ca`                                      |
| `VITE_TIME_ZONE`         | `Europe/Madrid`                           |
| `VITE_SUPABASE_URL`      | `https://<ref>.supabase.co`               |
| `VITE_SUPABASE_ANON_KEY` | the project's anon key — public by design |
| `VITE_WHATSAPP_URL`      | the group invite link                     |

Paste the hex colours plain, with no quotes. The quoting rule in
`.env.example` is a dotenv quirk and does not apply here.

Forget one of `VITE_APP_NAME`, `VITE_APP_SHORT_NAME`, `VITE_SUPABASE_URL` or
`VITE_SUPABASE_ANON_KEY` and the build stops with a message naming exactly
which. That is deliberate: the alternative is a deploy that succeeds and shows
`%VITE_APP_NAME%` in the title bar.

`public/_headers` and `public/_redirects` are copied into `dist` and picked up
automatically. They stop the HTTP cache holding a stale `index.html` or `sw.js`,
which is what would otherwise show pre-reveal content after a reveal.

Deploy. Note the URL: `https://<project>.pages.dev`.

### 6. Supabase — point auth at the real address

Authentication → URL Configuration.

**Site URL**

```
https://<project>.pages.dev
```

**Redirect URLs** — the second line covers preview deploys, which get a
different hostname on every pull request:

```
https://<project>.pages.dev/**
https://*.<project>.pages.dev/**
```

No rebuild is needed after this. The app derives its redirect from
`window.location.origin` at run time, so it follows whatever address it is
served from.

### 7. GitHub — the keepalive secrets

Settings → Secrets and variables → Actions:

| Secret              | Value                       |
| ------------------- | --------------------------- |
| `SUPABASE_URL`      | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | the same anon key           |

Free-tier projects pause after a week without activity, and over the summer
that will happen. Note that GitHub also disables scheduled workflows in a
public repository after 60 days with no commits, and emails the owner — so the
thing keeping the database awake falls asleep first if work stops. Treat that
email as an action item.

### 8. Test it on an iPhone

See _Checking the iPhone round trip_ above. Do it before the first event, not
after.

### If you ever turn the email fallback back on

`VITE_AUTH_EMAIL_FALLBACK=true` is only half of it. The email templates in
`supabase/templates/` are wired up in `config.toml`, which is local-only, so
they have to be pasted into Authentication → Emails in the dashboard as well.
Otherwise the association's first contact with a new member is Supabase's
English default. Turn _Confirm email_ off there too, so the sign-in link is the
confirmation rather than a second step.

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
