---
category: Actions
---

The primary action. Full width, square corners, and it grows rather than clips.

Two rules are built into it rather than left to discipline:

- **CTAs are square.** `--ds-radius-cta` is 0. That is the look, not an
  oversight — do not add a radius.
- **CTAs grow, they never clip.** There is no `height`, no `nowrap` and no
  ellipsis anywhere in it, only `min-height`. Catalan runs 15–20% longer than
  English, so a label wraps to two lines and the button gets taller. Never
  constrain its height or truncate its label.

`variant`: `primary` (brand red — note it uses `--ds-brand-cta`, not the
identity red, which fails AA behind a label), `secondary` (raised surface with
a hairline inset), `ghost` (text only), `destructive` (amber — red is the
association here, not danger).

`size`: `md` and `lg` are the body face at `text-xl`; `hero` is the display
face, uppercase, for the one decision on an entry screen.

Everything else is a plain `<button>` prop, `disabled` included.

```tsx
<Button size="hero">Entra</Button>
<Button variant="secondary" onClick={change}>Canvia la resposta</Button>
```

For a row of them — sí / potser / no — use `ButtonGroup`, which keeps them all
as tall as the tallest.
