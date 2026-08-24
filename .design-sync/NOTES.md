# design-sync notes — app-comi

Repo-specific gotchas for whoever runs the next sync. Read this before touching
anything; most of it cost a debugging cycle to find.

## The shape of this repo

- **app-comi is an application, not a component library.** `private: true`, no
  `main`/`module`/`exports`, and `dist/` is the Vite _app_ build. There is no
  library entry to point the converter at, so `.design-sync/entry.tsx` IS the
  entry (`--entry`), and it is hand-maintained: one explicit `export` line per
  component. **Adding a component to the design system means two edits** — a
  line in `entry.tsx` and a `componentSrcMap` entry in `config.json` (plus a
  doc, see below).
- `--entry` is also what makes `PKG_DIR` resolve: without it the converter
  looks for `node_modules/app-comi`, which npm will never create for the repo
  itself, and dies on a missing `package.json`.
- Because there is no shipped `.d.ts` tree, `componentSrcMap` has to enumerate
  **every** component, not just exceptions — the converter's src-scan fallback
  only runs when the map is empty. That is the opposite of the sparse-map
  advice in the skill, and it is correct here.

## Two stubs, and why the bundle needs them

`.design-sync/tsconfig.sync.json` (wired via `cfg.tsconfig`) maps two aliases
to preview-safe stubs:

- `@/config/env` → `stubs/env.ts`. The real module reads `import.meta.env` and
  **throws** on a missing key. The bundle is an IIFE with no `import.meta` and
  no `.env`, so the real one takes the whole `window.AppComi` global down at
  load. The stub's Supabase values are deliberately fake.
- `@/config/brand` → `stubs/brand.ts`. Needed as well because the real
  `brand.ts` imports `./env` **relatively**, which no `@/…` alias can
  intercept. Stubbing brand is what keeps the throwing module out of the graph.

The same file also pins `@/i18n` and `@/i18n/locales` at their `.ts` files:
both names are also **directories**, and the resolver tries the bare path
before the extensions, so it hands esbuild a directory to read and fails with
a `Función incorrecta` / EISDIR error.

## The stylesheet is generated, not shipped

`src/styles/index.css` is Tailwind _source_. A design composed in the hosted
tool gets only compiled CSS — no bundler runs there — so `cfg.buildCmd` runs
`.design-sync/build-css.mjs`, which:

1. **Derives a safelist from `theme.css`** (~3.5k utilities) and scans it with
   `@source`. Without it Tailwind emits only the classes the app currently
   uses, and a new screen written over there with `gap-7` or `bg-surface-4`
   would silently produce no rule. The safelist is derived, not hand-listed, so
   a new theme token brings its utilities along automatically.
2. **Copies the woff2 files next to the output.** Tailwind inlines the two
   @fontsource stylesheets but does **not** rewrite their `url(./files/…)`
   references, so the fonts have to sit in `.cache/files/` for design-sync to
   find and copy them.
3. **Writes `archivo-alias.css`** (wired via `cfg.extraFonts`), declaring the
   bare family name `Archivo` over the same variable files. `--ds-font-body`
   lists `'Archivo Variable', Archivo, …` and the second name has no
   `@font-face`, which is a real `[FONT_MISSING]`. Nothing is substituted —
   it is the same typeface under its short name.

Run `node .design-sync/build-css.mjs` before the converter whenever
`src/styles/**` or the previews change. Re-running it is a no-op.

## One lib fork

`.design-sync/overrides/source-kit.mjs` drops the path-derived component
group. Upstream takes the last meaningful directory segment, which is right for
a component library and wrong here: these files live in `src/ui/<Name>/` and
`src/features/<feature>/`, so it produced **thirteen** groups for twenty-one
components (share, rides, junta, logo, tabbar… mostly singletons) and silently
outranked the `category` frontmatter. With the group left `general`, the six
curated categories in `.design-sync/docs/*.md` decide. Every component needs a
doc file for that reason — a doc-less one lands in `general`.

Its relative imports are repointed at `../../.ds-sync/lib/`, and it imports
`ts-morph`, so it needs `.design-sync/node_modules` → `.ds-sync/node_modules`.
That link is gitignored: **recreate it on every fresh clone.** On Windows,
`New-Item -ItemType Junction` with an absolute target (a relative one is
rejected).

## Patch the harness's static server after re-copying the scripts

`.ds-sync/storybook/http-serve.mjs` serves `.js` as `text/javascript` with **no
charset**, and validate's `[BUNDLE_EXPORT]` smoke check builds its page with
`setContent` (no `<meta charset>`). The browser then decodes the UTF-8 bundle
as latin-1, and `cardFilename`'s `/[̀-ͯ]/` regex in `src/lib/share.ts`
— written with literal combining marks — becomes `Range out of order in
character class`. The whole bundle fails to evaluate and all 21 components are
reported as "not a component on window.AppComi".

The uploaded artifacts are fine: every `<Name>.html` declares
`<meta charset="utf-8">`. It is the local harness only. After the step-7
`cp -r`, re-apply:

```sh
sed -i "s|'.js': 'text/javascript'|'.js': 'text/javascript; charset=utf-8'|; \
        s|'.mjs': 'text/javascript'|'.mjs': 'text/javascript; charset=utf-8'|; \
        s|'.html': 'text/html'|'.html': 'text/html; charset=utf-8'|; \
        s|'.css': 'text/css'|'.css': 'text/css; charset=utf-8'|; \
        s|res.setHeader('Content-Type', 'text/html'); return res.end|res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end|" \
  .ds-sync/storybook/http-serve.mjs
```

Worth reporting upstream rather than carrying for ever.

## Previews

- Catalan is forced in `entry.tsx` (`i18n.changeLanguage('ca')`). The app's
  detector reads the browser language and headless chromium says `en-US`, so
  without it every card captures in the wrong language.
- **A preview must never import `@tanstack/react-query` itself** — that
  compiles a second copy of the library whose context the bundled component
  never reads, so the provider is present and the cache looks empty. Seed
  through `PreviewQuery` (exported from `entry.tsx`), which builds its client
  from the bundle's own copy and takes one seed per cell.
- Images are inline `data:` SVG URIs. The capture runs offline, so a remote
  photograph would quietly grade the fallback instead of the image path.
- `TabBar` is `position: fixed`. Its preview wraps it in a `transform`ed div,
  which makes that div the containing block and pins the bar to the card
  instead of the viewport. Same trick for anything else fixed.
- Every component except `Button`, `HomeIcon`, `LogoMark`, `ProfileIcon`,
  `ProposalsIcon`, `QrIcon` and `RankingIcon` carries a `cardMode` override in
  `config.json` — they render wider than a grid cell at phone width, which is
  simply what a 390px component does. `TabBar` is `single` (fixed positioning
  escapes any grid). Expect new phone-width components to need the same.

## Known render warns

None. The last full validate exited clean with zero warnings.

## Re-sync risks

- **`.design-sync/stubs/env.ts` inlines the association's display strings**
  (name, short name, tagline) copied from `.env`. If the association is renamed
  — or the repo is forked for another one — the stub keeps the old name and
  every card silently shows it. `LogoMark` and `Wordmark` render it directly.
- **The safelist is derived from `theme.css`'s `@theme` blocks by regex.** If
  that file ever moves, or switches to a non-`@theme inline` mechanism, the
  derivation silently yields fewer families and designs lose vocabulary with no
  error. The `css:` line prints the count — a sudden drop from ~3.5k is the
  signal.
- **`ExitPhotoCard`'s preview depends on wall-clock time.** Its `ends_at` is
  `Date.now() - 6h` because the card only appears within 36 hours of an event
  ending. It is deterministic, but if the component's window rule changes the
  preview goes blank rather than failing loudly.
- **`ShareCard` captures its "cannot share files" label**, because headless
  chromium has no `navigator.share` for files. On a phone the same button says
  "comparteix". Not a defect; do not "fix" it.
- **The fork tracks upstream `lib/source-kit.mjs`.** Diff them on re-sync and
  merge anything new — the fork only means to change the group derivation.
- The `node_modules` used for the build is the main checkout's, reached through
  a junction when working in a git worktree. It follows whatever the app's
  lockfile currently resolves; a React major bump would show up here first.
