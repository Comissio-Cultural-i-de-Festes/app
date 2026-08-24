---
category: Navigation
---

The Rànquing tab glyph: three rising bars.

Same API as every tab icon — one optional `className` that replaces the 21×21
default outright, `fill: currentColor`, `aria-hidden`.

```tsx
<span className="text-brand-icon">
  <RankingIcon />
</span>
```

Current tab is `text-brand-icon` with a `text-brand-label` label; the rest are
`text-fg-dim` with `--ds-text-muted-lo`.
