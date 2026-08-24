# Building with app-comi

A **phone-only, dark-only** design system for a Catalan student association's
app. Every screen is designed at **390px** and there is no light theme —
`color-scheme: dark` is set on `:root` and no `dark:` variant exists. Never
write one, and never assume a white background.

## The shell every screen needs

`base.css` (inside `styles.css`) already paints `body` with the canvas
background, the Archivo body face and the primary text colour. What it cannot
do for you is the phone column, so wrap your screen:

```jsx
const { AppComiProviders } = window.AppComi

function Screen({ children }) {
  return (
    <AppComiProviders>
      <div className="mx-auto min-h-dvh max-w-[var(--ds-shell-max-w)] bg-app">
        <main className="px-[var(--ds-gutter)] pt-9">{children}</main>
      </div>
    </AppComiProviders>
  )
}
```

- **`AppComiProviders`** supplies the three contexts the library reads — i18n
  (its copy is Catalan), a router (`JuntaHeader` and `ExitPhotoCard` render
  `<Link>`), and react-query (`ExitPhotoCard` reads a query). Components that
  need them render blank or throw without it. It adds no markup or styling.
- **`DesignPreviewProviders`** is the same thing plus a padded dark box, and
  exists only for the component-card grid. Do not use it in a screen.
- `bg-app` on the column, `px-[var(--ds-gutter)]` for side padding, and
  `.with-tabbar` on the scrolling element when a `TabBar` is present — that
  class is how content clears the bar; a hardcoded bottom padding will drift.

## The styling idiom: Tailwind v4 over `--ds-*` tokens

Utilities are generated from `@theme inline`, so every one of them emits
`var(--ds-…)` rather than a baked value. Use the utility, not the raw hex —
and never invent a colour. These are the complete families:

| Family        | Utilities                 | Names                                                                                                                                                              |
| ------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Surfaces      | `bg-`, `border-`, `text-` | `canvas` `root` `app` `bar` `card` `surface-1`…`surface-9`                                                                                                         |
| Edges         | `border-`                 | `border` `border-hair` `border-strong`                                                                                                                             |
| Text          | `text-`                   | `fg` `fg-secondary` `fg-muted` `fg-dim` `fg-faint` `fg-faint-lo` `fg-muted-lo` `fg-selected` `on-brand` `on-state`                                                 |
| Brand         | `bg-`, `text-`, `border-` | `brand` `brand-cta` `brand-strong` `brand-icon` `brand-accent` `brand-label` `brand-tint` `brand-tint-soft` `brand-banner` `brand-banner-border` `brand-banner-fg` |
| State         | `bg-`, `text-`            | `success` `error` `warning` `warning-deep` `unknown`                                                                                                               |
| Google        | `bg-`, `text-`            | `google-bg` `google-fg`                                                                                                                                            |
| Body sizes    | `text-`                   | `3xs` `2xs` `xs` `sm` `md` `base` `lg` `xl` `2xl` `3xl`                                                                                                            |
| Display sizes | `text-`                   | `d-xs` `d-s` `d-sm` `d-md` `d-lg` `d-xl`                                                                                                                           |
| Faces         | `font-`                   | `display` `body`                                                                                                                                                   |
| Radii         | `rounded-`                | `hairline` `xs` `sm` `md` `lg` `card` `chip` `round` `cta`                                                                                                         |
| Shadow        | `shadow-`                 | `brand`                                                                                                                                                            |

Two rules that are easy to get wrong:

- **`bg-brand` is the identity red; `bg-brand-cta` is the one to put a label
  on.** The identity red fails AA behind text. Buttons and CTAs use
  `brand-cta` with `text-on-brand`.
- **Amber, not red, means danger** (`text-warning`, `text-warning-deep`). Red
  is the association here, so a red "delete" reads as branding.

**The numeric scale is 2px, not 4px** — `--spacing: 2px`. So `gap-5` is 10px,
`p-9` is 18px (the card padding), `px-10` is 20px (the screen gutter). Double
what you would write elsewhere.

Four shared classes carry type treatments no utility does: `.display`
(Archivo Black, uppercase, tight tracking — headlines), `.eyebrow` and
`.eyebrow-sm` (small uppercase label above a heading), `.tabular` (lining
figures for counts and points).

## Copy, and why the components are square

Labels are Catalan and Catalan runs 15–20% longer than English. Nothing in
this system clips: no fixed heights, no `nowrap`, no ellipsis. Give text room
to wrap and let containers grow — `[text-wrap:balance]` on headlines and CTA
labels, `[text-wrap:pretty]` on body copy, which is what the components do
themselves.

CTAs have **no corner radius** (`--ds-radius-cta` is 0). That is the look, not
an omission. Cards and chips do have radii — use `rounded-card` / `rounded-chip`.

## Where the truth is

- `_ds/<folder>/styles.css` and the files it imports — the whole compiled
  stylesheet, including every `--ds-*` definition and the `@theme` mapping.
  Read it before inventing a class.
- `_ds/<folder>/components/<group>/<Name>/<Name>.prompt.md` — per-component
  usage, with the constraints that matter for that one component.
- `<Name>.d.ts` — the prop contract.

## A screen, idiomatically

```jsx
const { AppComiProviders, Wordmark, Button, ButtonGroup, TextField } = window.AppComi

function EventScreen() {
  return (
    <AppComiProviders>
      <div className="mx-auto min-h-dvh max-w-[var(--ds-shell-max-w)] bg-app">
        <main className="px-[var(--ds-gutter)] pt-12">
          <Wordmark size={56} />
          <p className="eyebrow mt-9 text-brand-accent">Divendres 12</p>
          <h1 className="display mt-4 text-d-sm tracking-[-0.045em] [text-wrap:balance]">
            Sopar de tardor
          </h1>
          <p className="mt-6 text-base text-fg-secondary [text-wrap:pretty]">
            Nau 3, Polígon del Rengle. Queden vuit places de trenta.
          </p>

          <div className="mt-9 border border-border-strong bg-surface-1 p-9">
            <TextField id="qui" label="Qui hi véns" placeholder="Amb qui" />
          </div>

          <div className="mt-9">
            <ButtonGroup>
              <Button>Sí</Button>
              <Button variant="secondary">Potser</Button>
              <Button variant="secondary">No</Button>
            </ButtonGroup>
          </div>
        </main>
      </div>
    </AppComiProviders>
  )
}
```
