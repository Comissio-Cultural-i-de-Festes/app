---
category: Navigation
---

The Inici tab glyph: four squares — the grid of what is on, not a house.

All five tab icons share one API: a single optional `className`, which replaces
the 21×21 default outright. They are `fill: currentColor` and `aria-hidden`, so
colour comes from the parent's text colour and the name comes from the link's
`aria-label`.

```tsx
<span className="text-brand-icon"><HomeIcon /></span>
<HomeIcon className="h-[34px] w-[34px] text-fg-dim" />
```

Passing `className` for colour only means also restating the size — the default
is dropped, not merged.
