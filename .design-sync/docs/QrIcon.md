---
category: Navigation
---

The My QR glyph, and the only tab icon that normally sits **on** brand rather
than beside it.

The centre slot of the tab bar is an action, not a tab: a 44px brand square
with this glyph in `text-on-brand` and the brand shadow under it.

```tsx
<span className="grid size-[44px] place-items-center rounded-card bg-brand text-on-brand shadow-brand">
  <QrIcon />
</span>
```

Same API as every tab icon: one optional `className` replacing the 21×21
default, `fill: currentColor`, `aria-hidden`.
